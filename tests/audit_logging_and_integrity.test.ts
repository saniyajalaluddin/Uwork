import test from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import {
  logAuditEvent,
  verifyAuditChain,
  GENESIS_HASH,
  computeAuditHash,
} from "../src/services/audit.service";
import { GET as auditLogsGetRoute, POST as auditLogsPostRoute } from "../src/app/api/audit-logs/route";
import { NextRequest } from "next/server";

test("Phase 10: Enterprise Audit Logging & Tamper Resistance", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("AuditPass123!#");

  // Setup Tenant A (Global Retail Group)
  const orgA = await prisma.organization.create({
    data: { name: `Global Retail ${timestamp}`, slug: `global-retail-${timestamp}` },
  });
  const adminA = await prisma.user.create({
    data: {
      email: `compliance_officer_${timestamp}@example.com`,
      passwordHash,
      firstName: "Compliance",
      lastName: "Officer",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: adminA.id, role: "ADMIN" },
  });
  const sessionAdminA = await createSession(adminA.id, orgA.id);

  // Non-privileged user in Tenant A (Viewer)
  const viewerA = await prisma.user.create({
    data: {
      email: `intern_viewer_${timestamp}@example.com`,
      passwordHash,
      firstName: "Intern",
      lastName: "Viewer",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: viewerA.id, role: "VIEWER" },
  });
  const sessionViewerA = await createSession(viewerA.id, orgA.id);

  // Setup Tenant B (Nexus Financial)
  const orgB = await prisma.organization.create({
    data: { name: `Nexus Financial ${timestamp}`, slug: `nexus-financial-${timestamp}` },
  });
  const adminB = await prisma.user.create({
    data: {
      email: `sec_lead_${timestamp}@example.com`,
      passwordHash,
      firstName: "Security",
      lastName: "Lead",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: adminB.id, role: "ADMIN" },
  });
  const sessionAdminB = await createSession(adminB.id, orgB.id);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Cryptographic SHA-256 Hash Chaining & Monotonic Sequence
    // ------------------------------------------------------------------------
    let log1: any, log2: any, log3: any;
    await t.test("1. Establishes deterministic SHA-256 hash chain with sequential links", async () => {
      log1 = await logAuditEvent({
        organizationId: orgA.id,
        userId: adminA.id,
        action: "DATASET_UPLOAD",
        resourceType: "DATASET",
        resourceId: "ds-001",
        status: "SUCCESS",
        metadata: { fileName: "q4_financials.xlsx" },
      });

      log2 = await logAuditEvent({
        organizationId: orgA.id,
        userId: adminA.id,
        action: "FORECAST_EXECUTE",
        resourceType: "FORECAST",
        resourceId: "fc-001",
        status: "SUCCESS",
        metadata: { model: "ARIMA_DYNAMIC_ENSEMBLE" },
      });

      log3 = await logAuditEvent({
        organizationId: orgA.id,
        userId: adminA.id,
        action: "REPORT_EXPORT",
        resourceType: "REPORT",
        resourceId: "rep-001",
        status: "SUCCESS",
        metadata: { format: "PDF" },
      });

      const meta1 = JSON.parse(log1.metadataJson)._auditChain;
      const meta2 = JSON.parse(log2.metadataJson)._auditChain;
      const meta3 = JSON.parse(log3.metadataJson)._auditChain;

      // Validate sequences
      assert.strictEqual(meta1.sequenceNumber, 1);
      assert.strictEqual(meta2.sequenceNumber, 2);
      assert.strictEqual(meta3.sequenceNumber, 3);

      // Validate hash chain links
      assert.strictEqual(meta1.previousHash, GENESIS_HASH);
      assert.strictEqual(meta2.previousHash, meta1.hash);
      assert.strictEqual(meta3.previousHash, meta2.hash);

      // Verify chain via verifyAuditChain
      const verification = await verifyAuditChain(orgA.id);
      assert.strictEqual(verification.valid, true);
      assert.strictEqual(verification.totalEntries, 3);
      assert.strictEqual(verification.verifiedCount, 3);
      assert.strictEqual(verification.headHash, meta3.hash);

      // Verify with explicit expectedHeadHash
      const headVerification = await verifyAuditChain(orgA.id, meta3.hash);
      assert.strictEqual(headVerification.valid, true);
    });

    // ------------------------------------------------------------------------
    // TEST 2: Tamper Detection (Direct Record Mutation In Database)
    // ------------------------------------------------------------------------
    await t.test("2. Detects direct database record tampering and isolates corrupted record", async () => {
      // Simulate adversarial mutation of log2 action directly in the DB
      const originalLog2 = await prisma.auditLog.findUniqueOrThrow({ where: { id: log2.id } });
      await prisma.auditLog.update({
        where: { id: log2.id },
        data: { action: "DATASET_PURGE_UNAUTHORIZED" },
      });

      // Verification should immediately catch content mutation
      const tamperedCheck = await verifyAuditChain(orgA.id);
      assert.strictEqual(tamperedCheck.valid, false);
      assert.ok(tamperedCheck.tamperDetectedAt);
      assert.strictEqual(tamperedCheck.tamperDetectedAt.sequenceNumber, 2);
      assert.strictEqual(tamperedCheck.tamperDetectedAt.logId, log2.id);
      assert.ok(tamperedCheck.tamperDetectedAt.reason.includes("Record content altered"));

      // Revert tampering
      await prisma.auditLog.update({
        where: { id: log2.id },
        data: { action: originalLog2.action },
      });

      // Verify restored integrity
      const restoredCheck = await verifyAuditChain(orgA.id);
      assert.strictEqual(restoredCheck.valid, true);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Deletion Detection & Head Truncation Detection
    // ------------------------------------------------------------------------
    await t.test("3. Detects record deletions and tail truncation", async () => {
      // Create a temporary log 4
      const log4 = await logAuditEvent({
        organizationId: orgA.id,
        userId: adminA.id,
        action: "TEMP_ACTION",
        resourceType: "TEMP",
        resourceId: "temp-001",
        status: "SUCCESS",
      });
      const meta4 = JSON.parse(log4.metadataJson)._auditChain;

      const valid4 = await verifyAuditChain(orgA.id);
      assert.strictEqual(valid4.valid, true);
      assert.strictEqual(valid4.totalEntries, 4);

      // Now delete log4, but verify against expectedHeadHash (tail truncation detection)
      await prisma.auditLog.delete({ where: { id: log4.id } });
      const truncationCheck = await verifyAuditChain(orgA.id, meta4.hash);
      assert.strictEqual(truncationCheck.valid, false);
      assert.ok(truncationCheck.tamperDetectedAt?.reason.includes("Head hash mismatch"));

      // Now delete intermediate log2 and check sequence/chain link break
      await prisma.auditLog.delete({ where: { id: log2.id } });
      const deletionCheck = await verifyAuditChain(orgA.id);
      assert.strictEqual(deletionCheck.valid, false);
      assert.ok(deletionCheck.tamperDetectedAt);
      assert.ok(
        deletionCheck.tamperDetectedAt.reason.includes("Sequence gap detected") ||
        deletionCheck.tamperDetectedAt.reason.includes("Broken chain link")
      );
    });

    // ------------------------------------------------------------------------
    // TEST 4: Multi-Tenant Isolation & REST API Endpoint Hardening
    // ------------------------------------------------------------------------
    await t.test("4. Enforces RBAC and tenant isolation across audit REST endpoints", async () => {
      // Log an event for Tenant B
      const logB = await logAuditEvent({
        organizationId: orgB.id,
        userId: adminB.id,
        action: "FINANCIAL_MODEL_RUN",
        resourceType: "MODEL",
        resourceId: "mod-b",
        status: "SUCCESS",
      });

      // 1. Viewer cannot access audit logs (403 Forbidden)
      const viewerReq = new NextRequest("http://localhost:3000/api/audit-logs", {
        method: "GET",
        headers: new Headers({
          cookie: `uwork_session=${sessionViewerA.rawToken}`,
        }),
      });
      const viewerRes = await auditLogsGetRoute(viewerReq);
      assert.strictEqual(viewerRes.status, 403);

      // 2. Admin of Tenant B can GET audit logs and verifies Tenant B isolation
      const adminBReq = new NextRequest("http://localhost:3000/api/audit-logs?verify=true", {
        method: "GET",
        headers: new Headers({
          cookie: `uwork_session=${sessionAdminB.rawToken}`,
        }),
      });
      const adminBRes = await auditLogsGetRoute(adminBReq);
      assert.strictEqual(adminBRes.status, 200);
      const adminBData = await adminBRes.json();
      assert.strictEqual(adminBData.success, true);
      assert.strictEqual(adminBData.data.count, 1);
      assert.strictEqual(adminBData.data.logs[0].id, logB.id);
      assert.strictEqual(adminBData.data.chainVerification.valid, true);

      // 3. Programmatic POST to emit audit log for Tenant B
      const postReq = new NextRequest("http://localhost:3000/api/audit-logs", {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          cookie: `uwork_session=${sessionAdminB.rawToken}`,
        }),
        body: JSON.stringify({
          action: "API_KEY_ROTATED",
          resourceType: "API_KEY",
          resourceId: "key-999",
          status: "SUCCESS",
        }),
      });
      const postRes = await auditLogsPostRoute(postReq);
      assert.strictEqual(postRes.status, 200);
      const postData = await postRes.json();
      assert.strictEqual(postData.success, true);
      assert.strictEqual(postData.data.log.action, "API_KEY_ROTATED");

      // Verify Tenant B chain now has 2 entries and is valid
      const verifyPostReq = new NextRequest("http://localhost:3000/api/audit-logs", {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          cookie: `uwork_session=${sessionAdminB.rawToken}`,
        }),
        body: JSON.stringify({
          action: "VERIFY_CHAIN",
        }),
      });
      const verifyPostRes = await auditLogsPostRoute(verifyPostReq);
      assert.strictEqual(verifyPostRes.status, 200);
      const verifyPostData = await verifyPostRes.json();
      assert.strictEqual(verifyPostData.data.verification.valid, true);
      assert.strictEqual(verifyPostData.data.verification.totalEntries, 2);
    });
  } finally {
    // Cleanup
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [adminA.id, viewerA.id, adminB.id] } },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminA.id, viewerA.id, adminB.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
  }
});


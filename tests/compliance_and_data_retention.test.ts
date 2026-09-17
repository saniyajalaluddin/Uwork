import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import {
  getRetentionPolicies,
  updateRetentionPolicies,
  executeRetentionCleanup,
  anonymizeUserAccount,
  createTenantDataExport,
  getTenantDataExport,
  listTenantDataExports,
} from "../src/services/compliance.service";
import { GET as getRetentionRoute, PATCH as patchRetentionRoute } from "../src/app/api/compliance/retention/route";
import { POST as cleanupRetentionRoute } from "../src/app/api/compliance/retention/cleanup/route";
import { GET as listExportsRoute, POST as createExportRoute } from "../src/app/api/compliance/export/route";
import { GET as getExportItemRoute } from "../src/app/api/compliance/export/[id]/route";
import { POST as anonymizeUserRoute } from "../src/app/api/user/anonymize/route";
import { NextRequest } from "next/server";

test("Phase 21: Data Retention Policies, GDPR Right to Be Forgotten & Tenant Data Export", async (t) => {
  const timestamp = Date.now();
  const rawPassword = "ValidPassword123!";
  const passwordHash = await hashPassword(rawPassword);

  // 1. Setup Tenant Alpha (Primary Test Org)
  const orgAlpha = await prisma.organization.create({
    data: {
      name: `Compliance Corp Alpha ${timestamp}`,
      slug: `compliance-alpha-${timestamp}`,
      planTier: "ENTERPRISE",
      retentionAuditDays: 365,
      retentionForecastDays: 180,
      retentionJobDays: 30,
    },
  });

  const userAlphaOwner = await prisma.user.create({
    data: {
      email: `alpha_compliance_owner_${timestamp}@example.com`,
      passwordHash,
      firstName: "Alpha",
      lastName: "Owner",
    },
  });

  const userAlphaMember = await prisma.user.create({
    data: {
      email: `alpha_compliance_member_${timestamp}@example.com`,
      passwordHash,
      firstName: "Alpha",
      lastName: "Member",
    },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: orgAlpha.id, userId: userAlphaOwner.id, role: "OWNER" },
      { organizationId: orgAlpha.id, userId: userAlphaMember.id, role: "ANALYST" },
    ],
  });

  const sessionAlphaOwner = await createSession(userAlphaOwner.id, orgAlpha.id);
  const sessionAlphaMember = await createSession(userAlphaMember.id, orgAlpha.id);

  // 2. Setup Tenant Beta (for IDOR isolation tests)
  const orgBeta = await prisma.organization.create({
    data: {
      name: `Compliance Corp Beta ${timestamp}`,
      slug: `compliance-beta-${timestamp}`,
      planTier: "PRO",
    },
  });

  const userBetaOwner = await prisma.user.create({
    data: {
      email: `beta_compliance_owner_${timestamp}@example.com`,
      passwordHash,
      firstName: "Beta",
      lastName: "Owner",
    },
  });

  await prisma.organizationMember.create({
    data: { organizationId: orgBeta.id, userId: userBetaOwner.id, role: "OWNER" },
  });

  const sessionBetaOwner = await createSession(userBetaOwner.id, orgBeta.id);

  // Seed baseline dataset and version for orgAlpha
  const testDataset = await prisma.dataset.create({
    data: {
      organizationId: orgAlpha.id,
      name: "Compliance Dataset",
      description: "Dataset for compliance retention & export testing",
      createdById: userAlphaOwner.id,
    },
  });

  const testVersion = await prisma.datasetVersion.create({
    data: {
      datasetId: testDataset.id,
      versionNumber: 1,
      storagePath: "/storage/compliance.csv",
      fileName: "compliance.csv",
      fileSizeBytes: 2048,
      mimeType: "text/csv",
      rowCount: 50,
      columnCount: 4,
      checksumSha256: "test_checksum_sha256",
      status: "READY",
    },
  });

  // Helper for mock HTTP requests
  const createMockReq = (
    url: string,
    method = "GET",
    body?: any,
    sessionToken = sessionAlphaOwner.rawToken,
    searchParams?: Record<string, string>
  ) => {
    const fullUrl = new URL(url, "http://localhost:3000");
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        fullUrl.searchParams.set(k, v);
      }
    }
    const headers: Record<string, string> = {
      cookie: `uwork_session=${sessionToken}`,
      "x-request-id": `req_compliance_test_${Date.now()}`,
    };
    if (body) headers["content-type"] = "application/json";

    return new NextRequest(fullUrl.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  await t.test("Subtest 1: Data Retention Policies Configuration & Platform Boundary Validation", async () => {
    // A. Query default retention policies
    const defaults = await getRetentionPolicies(orgAlpha.id);
    assert.strictEqual(defaults.retentionAuditDays, 365);
    assert.strictEqual(defaults.retentionForecastDays, 180);
    assert.strictEqual(defaults.retentionJobDays, 30);

    // B. Boundary validation: Audit days < 30 or > 2555
    await assert.rejects(
      () => updateRetentionPolicies(orgAlpha.id, { auditDays: 10 }, userAlphaOwner.id),
      /between 30 days and 2555 days/
    );
    await assert.rejects(
      () => updateRetentionPolicies(orgAlpha.id, { auditDays: 3000 }, userAlphaOwner.id),
      /between 30 days and 2555 days/
    );

    // C. Boundary validation: Forecast days < 7 or > 730
    await assert.rejects(
      () => updateRetentionPolicies(orgAlpha.id, { forecastDays: 3 }, userAlphaOwner.id),
      /between 7 days and 730 days/
    );

    // D. Boundary validation: Job days < 1 or > 365
    await assert.rejects(
      () => updateRetentionPolicies(orgAlpha.id, { jobDays: 0 }, userAlphaOwner.id),
      /between 1 day and 365 days/
    );

    // E. Valid update
    const updated = await updateRetentionPolicies(
      orgAlpha.id,
      { auditDays: 90, forecastDays: 60, jobDays: 14 },
      userAlphaOwner.id
    );
    assert.strictEqual(updated.retentionAuditDays, 90);
    assert.strictEqual(updated.retentionForecastDays, 60);
    assert.strictEqual(updated.retentionJobDays, 14);

    // F. Verify audit log was emitted
    const auditRecord = await prisma.auditLog.findFirst({
      where: { organizationId: orgAlpha.id, action: "RETENTION_POLICIES_UPDATED" },
    });
    assert.ok(auditRecord);
  });

  await t.test("Subtest 2: Automated Retention Cleanup & Pruning", async () => {
    const now = Date.now();

    // Configure specific retention windows for testing
    await updateRetentionPolicies(
      orgAlpha.id,
      { auditDays: 30, forecastDays: 10, jobDays: 7 },
      userAlphaOwner.id
    );

    // Seed expired audit log (40 days old)
    await prisma.auditLog.create({
      data: {
        organizationId: orgAlpha.id,
        action: "OLD_EXPIRED_EVENT",
        resourceType: "DATASET",
        resourceId: "old_ds_1",
        timestamp: new Date(now - 40 * 24 * 60 * 60 * 1000),
      },
    });

    // Seed fresh audit log (5 days old)
    const freshAudit = await prisma.auditLog.create({
      data: {
        organizationId: orgAlpha.id,
        action: "FRESH_ACTIVE_EVENT",
        resourceType: "DATASET",
        resourceId: "fresh_ds_1",
        timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),
      },
    });

    // Seed expired forecast (15 days old)
    await prisma.forecast.create({
      data: {
        organizationId: orgAlpha.id,
        datasetVersionId: testVersion.id,
        name: "Expired Forecast",
        targetColumnName: "Revenue",
        dateColumnName: "Date",
        createdAt: new Date(now - 15 * 24 * 60 * 60 * 1000),
      },
    });

    // Seed fresh forecast (2 days old)
    const freshForecast = await prisma.forecast.create({
      data: {
        organizationId: orgAlpha.id,
        datasetVersionId: testVersion.id,
        name: "Fresh Forecast",
        targetColumnName: "Revenue",
        dateColumnName: "Date",
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      },
    });

    // Seed expired completed job (10 days old)
    await prisma.job.create({
      data: {
        organizationId: orgAlpha.id,
        jobType: "DATASET_INGESTION",
        status: "COMPLETED",
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      },
    });

    // Seed fresh job (1 day old)
    const freshJob = await prisma.job.create({
      data: {
        organizationId: orgAlpha.id,
        jobType: "DATASET_INGESTION",
        status: "COMPLETED",
        createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      },
    });

    // Execute retention cleanup
    const cleanupResult = await executeRetentionCleanup(orgAlpha.id);
    assert.ok(cleanupResult.prunedAuditLogs >= 1);
    assert.ok(cleanupResult.prunedForecasts >= 1);
    assert.ok(cleanupResult.prunedJobs >= 1);

    // Confirm fresh items survived
    const survivingAudit = await prisma.auditLog.findUnique({ where: { id: freshAudit.id } });
    assert.ok(survivingAudit, "Fresh audit log must not be pruned");

    const survivingForecast = await prisma.forecast.findUnique({ where: { id: freshForecast.id } });
    assert.ok(survivingForecast, "Fresh forecast must not be pruned");

    const survivingJob = await prisma.job.findUnique({ where: { id: freshJob.id } });
    assert.ok(survivingJob, "Fresh job must not be pruned");
  });

  await t.test("Subtest 3: GDPR Right to Be Forgotten (Art. 17) & Sole-Owner Protection", async () => {
    // A. Sole-owner protection check:
    // userAlphaOwner is the sole OWNER of orgAlpha (userAlphaMember is an ANALYST).
    await assert.rejects(
      () => anonymizeUserAccount(userAlphaOwner.id, userAlphaOwner.id),
      /sole Owner of organization/
    );

    // B. Create a standalone disposable user with non-owner role
    const disposableUser = await prisma.user.create({
      data: {
        email: `disposable_gdpr_${timestamp}@example.com`,
        passwordHash,
        firstName: "GDPR",
        lastName: "Target",
      },
    });

    await prisma.organizationMember.create({
      data: {
        organizationId: orgAlpha.id,
        userId: disposableUser.id,
        role: "ANALYST",
      },
    });

    // Create session and notification for disposable user
    await createSession(disposableUser.id, orgAlpha.id);
    await prisma.notification.create({
      data: {
        organizationId: orgAlpha.id,
        userId: disposableUser.id,
        type: "SECURITY_EVENT",
        title: "Test notification",
        message: "Should be purged on anonymization",
      },
    });

    // Execute anonymization
    const anonymizeResult = await anonymizeUserAccount(disposableUser.id, userAlphaOwner.id);
    assert.strictEqual(anonymizeResult.success, true);
    assert.ok(anonymizeResult.anonymizedEmail.startsWith("anonymized_"));
    assert.ok(anonymizeResult.anonymizedEmail.endsWith("@deleted.uwork.internal"));

    // Verify user in database
    const scrubbedUser = await prisma.user.findUnique({ where: { id: disposableUser.id } });
    assert.ok(scrubbedUser);
    assert.strictEqual(scrubbedUser.firstName, "Anonymized");
    assert.strictEqual(scrubbedUser.lastName, "User");
    assert.strictEqual(scrubbedUser.passwordHash, "ANONYMIZED_GDPR_DELETED");
    assert.strictEqual(scrubbedUser.isActive, false);
    assert.ok(scrubbedUser.deletedAt);
    assert.ok(scrubbedUser.anonymizedAt);

    // Verify sessions, notifications, memberships purged
    const remainingSessions = await prisma.session.findMany({ where: { userId: disposableUser.id } });
    assert.strictEqual(remainingSessions.length, 0);

    const remainingNotifications = await prisma.notification.findMany({ where: { userId: disposableUser.id } });
    assert.strictEqual(remainingNotifications.length, 0);

    const remainingMemberships = await prisma.organizationMember.findMany({ where: { userId: disposableUser.id } });
    assert.strictEqual(remainingMemberships.length, 0);
  });

  await t.test("Subtest 4: GDPR Art. 20 Data Portability & Takeout Export Archive", async () => {
    // Seed test decision item for orgAlpha
    await prisma.decisionItem.create({
      data: {
        organizationId: orgAlpha.id,
        title: "Takeout Decision Item",
        category: "FINANCIAL",
        priority: "HIGH",
        status: "APPROVED",
        impactSummary: "Impact summary for compliance test",
        recommendedAction: "Execute approved actions",
      },
    });

    // Generate export archive
    const exportResult = await createTenantDataExport(orgAlpha.id, userAlphaOwner.id);
    assert.ok(exportResult.id);
    assert.strictEqual(exportResult.status, "COMPLETED");
    assert.ok(exportResult.fileSizeBytes && exportResult.fileSizeBytes > 0);
    assert.ok(exportResult.payload);

    // Validate GDPR Art. 20 payload structure
    const payload = exportResult.payload;
    assert.strictEqual(payload.schemaVersion, "1.0");
    assert.strictEqual(payload.organization.id, orgAlpha.id);
    assert.strictEqual(payload.organization.name, orgAlpha.name);
    assert.ok(Array.isArray(payload.members));
    assert.ok(Array.isArray(payload.datasets));
    assert.ok(Array.isArray(payload.forecasts));
    assert.ok(Array.isArray(payload.decisions));
    assert.ok(Array.isArray(payload.reports));
    assert.ok(Array.isArray(payload.auditTrail));

    // Security verify: credentials scrubbed
    for (const m of payload.members) {
      assert.strictEqual((m as any).passwordHash, undefined, "Export must never leak password hashes");
    }

    // Tenant isolation: Beta cannot view Alpha's export
    await assert.rejects(
      () => getTenantDataExport(orgBeta.id, exportResult.id),
      /not found in this organization/
    );

    // Alpha can view its own export
    const fetched = await getTenantDataExport(orgAlpha.id, exportResult.id);
    assert.strictEqual(fetched.id, exportResult.id);
    assert.strictEqual(fetched.data.organization.id, orgAlpha.id);

    // List exports
    const list = await listTenantDataExports(orgAlpha.id);
    assert.ok(list.length >= 1);
    assert.strictEqual(list[0].id, exportResult.id);
  });

  await t.test("Subtest 5: REST API Endpoints & Route Handlers", async () => {
    // A. GET /api/compliance/retention
    const getRes = await getRetentionRoute(createMockReq("/api/compliance/retention"));
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.ok(getData.data.retentionAuditDays);

    // B. PATCH /api/compliance/retention (as Owner - success)
    const patchRes = await patchRetentionRoute(
      createMockReq("/api/compliance/retention", "PATCH", { auditDays: 120, forecastDays: 45, jobDays: 20 })
    );
    assert.strictEqual(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.strictEqual(patchData.success, true);
    assert.strictEqual(patchData.data.policies.retentionAuditDays, 120);

    // C. PATCH /api/compliance/retention (as Member without org:manage - 403 Forbidden)
    const patchMemberRes = await patchRetentionRoute(
      createMockReq(
        "/api/compliance/retention",
        "PATCH",
        { auditDays: 60 },
        sessionAlphaMember.rawToken
      )
    );
    assert.strictEqual(patchMemberRes.status, 403);

    // D. POST /api/compliance/retention/cleanup
    const cleanupRes = await cleanupRetentionRoute(
      createMockReq("/api/compliance/retention/cleanup", "POST")
    );
    assert.strictEqual(cleanupRes.status, 200);
    const cleanupData = await cleanupRes.json();
    assert.strictEqual(cleanupData.success, true);
    assert.ok(cleanupData.data.result);

    // E. POST & GET /api/compliance/export
    const createExportRes = await createExportRoute(
      createMockReq("/api/compliance/export", "POST")
    );
    assert.strictEqual(createExportRes.status, 201);
    const createExportData = await createExportRes.json();
    assert.strictEqual(createExportData.success, true);
    const newExportId = createExportData.data.export.id;

    const listExportsRes = await listExportsRoute(
      createMockReq("/api/compliance/export")
    );
    assert.strictEqual(listExportsRes.status, 200);
    const listData = await listExportsRes.json();
    assert.ok(listData.data.exports.some((e: any) => e.id === newExportId));

    // F. GET /api/compliance/export/[id] (JSON mode)
    const getExportItemRes = await getExportItemRoute(
      createMockReq(`/api/compliance/export/${newExportId}`),
      { params: Promise.resolve({ id: newExportId }) }
    );
    assert.strictEqual(getExportItemRes.status, 200);
    const itemData = await getExportItemRes.json();
    assert.strictEqual(itemData.success, true);
    assert.strictEqual(itemData.data.export.id, newExportId);

    // G. GET /api/compliance/export/[id]?download=true (Attachment mode)
    const downloadRes = await getExportItemRoute(
      createMockReq(`/api/compliance/export/${newExportId}?download=true`, "GET", undefined, sessionAlphaOwner.rawToken, { download: "true" }),
      { params: Promise.resolve({ id: newExportId }) }
    );
    assert.strictEqual(downloadRes.status, 200);
    assert.strictEqual(downloadRes.headers.get("content-type"), "application/json");
    assert.ok(downloadRes.headers.get("content-disposition")?.includes("attachment"));

    // H. POST /api/user/anonymize (with wrong confirmation phrase)
    const badConfirmRes = await anonymizeUserRoute(
      createMockReq("/api/user/anonymize", "POST", {
        password: rawPassword,
        confirmation: "wrong phrase",
      })
    );
    assert.strictEqual(badConfirmRes.status, 400);

    // I. POST /api/user/anonymize (with wrong password)
    const badPasswordRes = await anonymizeUserRoute(
      createMockReq("/api/user/anonymize", "POST", {
        password: "IncorrectPassword!",
        confirmation: "DELETE MY ACCOUNT",
      })
    );
    assert.strictEqual(badPasswordRes.status, 400);

    // J. POST /api/user/anonymize (successful self-service anonymization for member)
    const goodAnonymizeRes = await anonymizeUserRoute(
      createMockReq(
        "/api/user/anonymize",
        "POST",
        { password: rawPassword, confirmation: "DELETE MY ACCOUNT" },
        sessionAlphaMember.rawToken
      )
    );
    assert.strictEqual(goodAnonymizeRes.status, 200);
    const anonymizeData = await goodAnonymizeRes.json();
    assert.strictEqual(anonymizeData.success, true);
    assert.ok(anonymizeData.data.result.anonymizedEmail.endsWith("@deleted.uwork.internal"));
  });
});


import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import {
  createDecisionItem,
  getDecisionItem,
  updateDecisionStatus,
  computeDecisionSLA,
  synthesizeDecisionsFromAnalytics,
} from "../src/services/decision.service";
import {
  GET as decisionsGetRoute,
  POST as decisionsPostRoute,
  PATCH as decisionsPatchRoute,
  DELETE as decisionsDeleteRoute,
} from "../src/app/api/decisions/route";
import { NextRequest } from "next/server";

test("Phase 17: Decision Center Action Tracking & Lifecycle Engine", async (t) => {
  const timestamp = Date.now();

  // Setup Tenant Alpha
  const orgA = await prisma.organization.create({
    data: {
      name: `Decision Tenant Alpha ${timestamp}`,
      slug: `dec-alpha-${timestamp}`,
    },
  });

  const userA = await prisma.user.create({
    data: {
      email: `dec_lead_a_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Decision",
      lastName: "Alpha",
    },
  });

  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: userA.id, role: "ADMIN" },
  });

  const sessionA = await createSession(userA.id, orgA.id);

  // Setup Tenant Beta
  const orgB = await prisma.organization.create({
    data: {
      name: `Decision Tenant Beta ${timestamp}`,
      slug: `dec-beta-${timestamp}`,
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: `dec_lead_b_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Decision",
      lastName: "Beta",
    },
  });

  await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
  });

  const sessionB = await createSession(userB.id, orgB.id);

  await t.test("1. Computes exact dynamic SLA timers and overdue flags based on priority", async () => {
    // 1. Fresh item: CRITICAL -> 24 hours SLA
    const freshItem = {
      priority: "CRITICAL",
      createdAt: new Date(),
      status: "OPEN",
    };
    const freshSla = computeDecisionSLA(freshItem);
    assert.strictEqual(freshSla.targetHours, 24);
    assert.strictEqual(freshSla.isOverdue, false);
    assert.ok(freshSla.remainingHours > 23);

    // 2. Overdue item: created 30 hours ago -> overdue by ~6 hours
    const overdueItem = {
      priority: "CRITICAL",
      createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      status: "OPEN",
    };
    const overdueSla = computeDecisionSLA(overdueItem);
    assert.strictEqual(overdueSla.isOverdue, true);
    assert.ok(overdueSla.remainingHours < 0);

    // 3. Resolved item created 30 hours ago -> not overdue because resolved
    const resolvedItem = {
      priority: "CRITICAL",
      createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      status: "RESOLVED",
    };
    const resolvedSla = computeDecisionSLA(resolvedItem);
    assert.strictEqual(resolvedSla.isOverdue, false);
  });

  await t.test("2. Enforces state machine transitions and logs resolution audits", async () => {
    const item = await createDecisionItem(orgA.id, {
      title: "Rebalance EU Cloud Instances",
      priority: "HIGH",
      category: "PRICING",
      impactSummary: "Recover 28% margin loss in EU Central.",
      recommendedAction: "Commit to 1-year reserved compute instance.",
      createdByUserId: userA.id,
    });

    assert.ok(item);
    assert.strictEqual(item.status, "OPEN");

    // Transition: OPEN -> ACKNOWLEDGED
    const acked = await updateDecisionStatus(orgA.id, item.id, {
      status: "ACKNOWLEDGED",
      userId: userA.id,
    });
    assert.ok(acked);
    assert.strictEqual(acked.status, "ACKNOWLEDGED");

    // Transition: ACKNOWLEDGED -> RESOLVED with notes
    const resolved = await updateDecisionStatus(orgA.id, item.id, {
      status: "RESOLVED",
      resolutionNotes: "Signed 1-year reserved contract with provider. Margin verified.",
      userId: userA.id,
    });
    assert.ok(resolved);
    assert.strictEqual(resolved.status, "RESOLVED");
    assert.strictEqual(
      resolved.evidence.resolutionNotes,
      "Signed 1-year reserved contract with provider. Margin verified."
    );

    // Verify audit log captured transition
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgA.id, resourceId: item.id },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(audit);
    assert.strictEqual(audit.action, "DECISION_STATUS_UPDATED");

    // Reopen: RESOLVED -> OPEN
    const reopened = await updateDecisionStatus(orgA.id, item.id, {
      status: "OPEN",
      userId: userA.id,
    });
    assert.strictEqual(reopened?.status, "OPEN");

    // Dismiss: OPEN -> DISMISSED
    const dismissed = await updateDecisionStatus(orgA.id, item.id, {
      status: "DISMISSED",
      userId: userA.id,
    });
    assert.strictEqual(dismissed?.status, "DISMISSED");

    // Illegal Transition: DISMISSED -> RESOLVED directly should throw
    await assert.rejects(
      async () => {
        await updateDecisionStatus(orgA.id, item.id, {
          status: "RESOLVED",
          userId: userA.id,
        });
      },
      /Illegal transition/,
      "Direct transition from DISMISSED to RESOLVED must be rejected"
    );
  });

  await t.test("3. Automated synthesis generates deduplicated actions from anomalies and health scores", async () => {
    // Create dataset and version for health score relation
    const ds = await prisma.dataset.create({
      data: {
        organizationId: orgA.id,
        name: "Synthesis Health Dataset",
        sourceType: "CSV",
        createdById: userA.id,
      },
    });

    const ver = await prisma.datasetVersion.create({
      data: {
        datasetId: ds.id,
        versionNumber: 1,
        storagePath: "storage/reports/test_synth.csv",
        fileName: "test_synth.csv",
        fileSizeBytes: 100,
        mimeType: "text/csv",
        rowCount: 10,
        columnCount: 2,
        checksumSha256: "test_checksum",
        status: "READY",
      },
    });

    // Create an ad-hoc critical anomaly in Tenant Alpha
    await prisma.anomaly.create({
      data: {
        organizationId: orgA.id,
        datasetVersionId: ver.id,
        metricName: "REVENUE_SPIKE_CORRUPT",
        timestamp: new Date().toISOString(),
        observedValue: 95000,
        expectedValue: 12000,
        deviationPct: 691.7,
        severity: "CRITICAL",
        detectionMethod: "HAMPEL_MAD",
        isAcknowledged: false,
      },
    });

    // Create a low health score record in Tenant Alpha
    await prisma.businessHealthScore.create({
      data: {
        organizationId: orgA.id,
        datasetVersionId: ver.id,
        overallScore: 54,
        revenueScore: 65,
        profitScore: 42, // Deficit (< 60)
        retentionScore: 50, // Deficit (< 65)
        growthScore: 60,
        stabilityScore: 55,
      },
    });

    // 1st Run of Synthesis: Should generate items for anomaly, profit, and retention
    const firstRun = await synthesizeDecisionsFromAnalytics(orgA.id);
    assert.ok(firstRun.synthesizedCount >= 2, "Must synthesize multiple actionable recommendations");

    // 2nd Run of Synthesis: Deduplication prevents creating redundant items
    const secondRun = await synthesizeDecisionsFromAnalytics(orgA.id);
    assert.strictEqual(secondRun.synthesizedCount, 0, "Second run must be idempotent and create 0 duplicates");
  });

  await t.test("4. Decision REST API enforces CRUD and cross-tenant IDOR attack protection", async () => {
    // 1. Tenant Alpha creates an item via POST /api/decisions
    const createReq = new NextRequest(new URL("http://localhost:3000/api/decisions"), {
      method: "POST",
      body: JSON.stringify({
        title: "Scale Regional Sales in EMEA",
        priority: "CRITICAL",
        category: "REVENUE",
        impactSummary: "Unmet inbound lead demand in Germany.",
        recommendedAction: "Reallocate 2 senior AEs.",
      }),
      headers: {
        cookie: `uwork_session=${sessionA.rawToken}`,
        "content-type": "application/json",
      },
    });

    const createRes = await decisionsPostRoute(createReq);
    assert.strictEqual(createRes.status, 201);
    const createJson = await createRes.json();
    const itemId = createJson.data.item.id;

    // 2. Tenant Beta attempts to modify Tenant Alpha's decision (IDOR Attack)
    const patchAttackReq = new NextRequest(new URL("http://localhost:3000/api/decisions"), {
      method: "PATCH",
      body: JSON.stringify({
        id: itemId,
        status: "RESOLVED",
      }),
      headers: {
        cookie: `uwork_session=${sessionB.rawToken}`,
        "content-type": "application/json",
      },
    });

    const patchAttackRes = await decisionsPatchRoute(patchAttackReq);
    assert.strictEqual(patchAttackRes.status, 404, "Cross-tenant decision tampering must return 404");

    // 3. Tenant Beta attempts to delete Tenant Alpha's decision (IDOR Attack)
    const deleteAttackReq = new NextRequest(
      new URL(`http://localhost:3000/api/decisions?id=${itemId}`),
      {
        method: "DELETE",
        headers: { cookie: `uwork_session=${sessionB.rawToken}` },
      }
    );

    const deleteAttackRes = await decisionsDeleteRoute(deleteAttackReq);
    assert.strictEqual(deleteAttackRes.status, 404, "Cross-tenant decision deletion must return 404");

    // 4. Tenant Alpha lists its decisions with filter
    const listReq = new NextRequest(
      new URL("http://localhost:3000/api/decisions?status=OPEN&priority=CRITICAL"),
      {
        method: "GET",
        headers: { cookie: `uwork_session=${sessionA.rawToken}` },
      }
    );

    const listRes = await decisionsGetRoute(listReq);
    assert.strictEqual(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.data.items.length >= 1);

    // 5. Tenant Alpha successfully deletes its decision
    const deleteLegitReq = new NextRequest(
      new URL(`http://localhost:3000/api/decisions?id=${itemId}`),
      {
        method: "DELETE",
        headers: { cookie: `uwork_session=${sessionA.rawToken}` },
      }
    );

    const deleteLegitRes = await decisionsDeleteRoute(deleteLegitReq);
    assert.strictEqual(deleteLegitRes.status, 200);
  });
});

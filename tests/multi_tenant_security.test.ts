import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession, validateSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { NextRequest } from "next/server";

// Import API route handlers to test real server execution
import { DELETE as deleteSession } from "../src/app/api/user/sessions/route";
import { GET as getNotifications, PATCH as patchNotifications } from "../src/app/api/notifications/route";
import { DELETE as deleteApiKey } from "../src/app/api/org/api-keys/route";
import { DELETE as deleteDataset, GET as getDatasets } from "../src/app/api/datasets/route";
import { GET as downloadReport } from "../src/app/api/reports/[id]/download/route";
import { PATCH as updateMemberRole, DELETE as deleteMember } from "../src/app/api/org/members/[id]/route";
import { POST as generateForecast } from "../src/app/api/forecasts/route";
import { GET as searchEverything } from "../src/app/api/search/route";

test("Multi-Tenant Security: Comprehensive Cross-Tenant IDOR Attack Verification", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SecurePass123!#");

  // 1. Setup Tenant A
  const orgA = await prisma.organization.create({
    data: { name: `Security Tenant A ${timestamp}`, slug: `sec-tenant-a-${timestamp}`, planTier: "ENTERPRISE" },
  });
  const userA = await prisma.user.create({
    data: { email: `attacker_a_${timestamp}@tenanta.com`, passwordHash, firstName: "Attacker", lastName: "Alice" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: userA.id, role: "OWNER" },
  });
  const sessionDataA = await createSession(userA.id, orgA.id);

  // User A2 (Colleague in Tenant A)
  const userA2 = await prisma.user.create({
    data: { email: `colleague_a2_${timestamp}@tenanta.com`, passwordHash, firstName: "Colleague", lastName: "Adam" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: userA2.id, role: "ANALYST" },
  });
  const sessionDataA2 = await createSession(userA2.id, orgA.id);

  // 2. Setup Tenant B (Victim)
  const orgB = await prisma.organization.create({
    data: { name: `Victim Tenant B ${timestamp}`, slug: `victim-tenant-b-${timestamp}`, planTier: "ENTERPRISE" },
  });
  const userB = await prisma.user.create({
    data: { email: `victim_b_${timestamp}@tenantb.com`, passwordHash, firstName: "Victim", lastName: "Bob" },
  });
  const memberB = await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: userB.id, role: "OWNER" },
  });
  const sessionDataB = await createSession(userB.id, orgB.id);

  // Victim resources in Tenant B
  const datasetB = await prisma.dataset.create({
    data: {
      organizationId: orgB.id,
      createdById: userB.id,
      name: `Top Secret Financials B ${timestamp}`,
      description: "Proprietary confidential dataset",
      sourceType: "CSV",
    },
  });

  const apiKeyB = await prisma.aPIKey.create({
    data: {
      organizationId: orgB.id,
      name: "Tenant B Secret Key",
      keyPrefix: "uw_live_victim...",
      keyHash: `hash_${timestamp}`,
      scopes: "read,write",
    },
  });

  const reportB = await prisma.report.create({
    data: {
      organizationId: orgB.id,
      generatedById: userB.id,
      title: "Tenant B Executive Q3 Summary",
      type: "EXECUTIVE_SUMMARY",
      format: "CSV",
      storagePath: "storage/reports/test_victim_report.csv",
    },
  });

  const notifB_private = await prisma.notification.create({
    data: {
      organizationId: orgB.id,
      userId: userB.id,
      title: "Private Victim Notification",
      message: "Secret financial alert",
      type: "SECURITY_EVENT",
    },
  });

  const notifA_private = await prisma.notification.create({
    data: {
      organizationId: orgA.id,
      userId: userA.id,
      title: "User A Confidential Receipt",
      message: "Personal export confirmation",
      type: "REPORT_READY",
    },
  });

  const notifA_broadcast = await prisma.notification.create({
    data: {
      organizationId: orgA.id,
      userId: null,
      title: "Org A Maintenance Notice",
      message: "Broadcast to all Org A members",
      type: "SECURITY_EVENT",
    },
  });

  // Helper to build authenticated NextRequest with session cookie
  const makeAuthRequest = (url: string, token: string, method: string = "GET", body?: any): NextRequest => {
    const headers = new Headers({
      cookie: `uwork_session=${token}`,
      "content-type": "application/json",
    });
    const init: RequestInit = { method, headers };
    if (body) init.body = JSON.stringify(body);
    return new NextRequest(new URL(url, "http://localhost:3000"), init as any);
  };

  try {
    // ------------------------------------------------------------------------
    // ATTACK 1: IDOR Session Revocation
    // Tenant A attempts to delete Tenant B's active session
    // ------------------------------------------------------------------------
    await t.test("IDOR Attack 1: Cross-Tenant Session Revocation Prevention", async () => {
      const attackReq = makeAuthRequest(
        `http://localhost:3000/api/user/sessions?id=${sessionDataB.session.id}`,
        sessionDataA.rawToken,
        "DELETE"
      );

      const response = await deleteSession(attackReq);
      const data = await response.json();

      assert.strictEqual(response.status, 404, "Must return 404 Not Found for cross-tenant session");
      assert.strictEqual(data.success, false);

      // Verify Victim's session was NOT deleted
      const survivingSession = await prisma.session.findUnique({
        where: { id: sessionDataB.session.id },
      });
      assert.ok(survivingSession, "Victim's session must remain intact in database");
    });

    // ------------------------------------------------------------------------
    // ATTACK 2: IDOR Dataset Deletion & Scoped Archival
    // Tenant A attempts to delete Tenant B's dataset
    // ------------------------------------------------------------------------
    await t.test("IDOR Attack 2: Cross-Tenant Dataset Deletion Prevention", async () => {
      const attackReq = makeAuthRequest(
        `http://localhost:3000/api/datasets?id=${datasetB.id}`,
        sessionDataA.rawToken,
        "DELETE"
      );

      const response = await deleteDataset(attackReq);
      const data = await response.json();

      assert.strictEqual(response.status, 404, "Must return 404 for alien dataset");
      assert.strictEqual(data.success, false);

      // Verify Victim's dataset was NOT archived or deleted
      const survivingDataset = await prisma.dataset.findUnique({
        where: { id: datasetB.id },
      });
      assert.strictEqual(survivingDataset?.isArchived, false, "Victim dataset must not be modified");
    });

    // ------------------------------------------------------------------------
    // ATTACK 3: IDOR Forecast Execution on Alien Dataset
    // Tenant A attempts to trigger forecasting on Tenant B's dataset
    // ------------------------------------------------------------------------
    await t.test("IDOR Attack 3: Forecast Generation on Alien Dataset Prevention", async () => {
      const attackReq = makeAuthRequest(
        "http://localhost:3000/api/forecasts",
        sessionDataA.rawToken,
        "POST",
        { datasetId: datasetB.id, targetColumn: "Revenue" }
      );

      const response = await generateForecast(attackReq);
      const data = await response.json();

      assert.strictEqual(response.status, 404, "Must return 404 when targeting alien dataset");
      assert.strictEqual(data.success, false);
    });

    // ------------------------------------------------------------------------
    // ATTACK 4: IDOR Member Manipulation
    // Tenant A attempts to demote or delete Tenant B's member
    // ------------------------------------------------------------------------
    await t.test("IDOR Attack 4: Cross-Tenant Organization Member Tampering Prevention", async () => {
      const patchReq = makeAuthRequest(
        `http://localhost:3000/api/org/members/${memberB.id}`,
        sessionDataA.rawToken,
        "PATCH",
        { role: "VIEWER" }
      );

      const patchRes = await updateMemberRole(patchReq, { params: Promise.resolve({ id: memberB.id }) });
      const patchData = await patchRes.json();

      assert.strictEqual(patchRes.status, 404, "Must return 404 for alien member role modification");
      assert.strictEqual(patchData.success, false);

      const deleteReq = makeAuthRequest(
        `http://localhost:3000/api/org/members/${memberB.id}`,
        sessionDataA.rawToken,
        "DELETE"
      );

      const delRes = await deleteMember(deleteReq, { params: Promise.resolve({ id: memberB.id }) });
      const delData = await delRes.json();

      assert.strictEqual(delRes.status, 404, "Must return 404 for alien member deletion");
      assert.strictEqual(delData.success, false);
    });

    // ------------------------------------------------------------------------
    // ATTACK 5: IDOR API Key Revocation
    // Tenant A attempts to revoke Tenant B's API key
    // ------------------------------------------------------------------------
    await t.test("IDOR Attack 5: Cross-Tenant API Key Revocation Prevention", async () => {
      const attackReq = makeAuthRequest(
        `http://localhost:3000/api/org/api-keys?id=${apiKeyB.id}`,
        sessionDataA.rawToken,
        "DELETE"
      );

      const response = await deleteApiKey(attackReq);
      const data = await response.json();

      assert.strictEqual(response.status, 404, "Must return 404 for alien API key");
      assert.strictEqual(data.success, false);

      const survivingKey = await prisma.aPIKey.findUnique({ where: { id: apiKeyB.id } });
      assert.ok(survivingKey, "Victim API key must remain alive");
    });

    // ------------------------------------------------------------------------
    // ATTACK 6: IDOR Report Download
    // Tenant A attempts to download Tenant B's report
    // ------------------------------------------------------------------------
    await t.test("IDOR Attack 6: Cross-Tenant Report Exfiltration Prevention", async () => {
      const attackReq = makeAuthRequest(
        `http://localhost:3000/api/reports/${reportB.id}/download`,
        sessionDataA.rawToken,
        "GET"
      );

      const response = await downloadReport(attackReq, { params: Promise.resolve({ id: reportB.id }) });
      assert.strictEqual(response.status, 404, "Must reject alien report download with 404");
    });

    // ------------------------------------------------------------------------
    // ATTACK 7: Notification Isolation & User Scoping
    // ------------------------------------------------------------------------
    await t.test("Isolation Attack 7: Notification Privacy & Scoped Mark-Read", async () => {
      // User A retrieves notifications: should see notifA_private and notifA_broadcast, NEVER notifB
      const getReqA = makeAuthRequest("http://localhost:3000/api/notifications", sessionDataA.rawToken, "GET");
      const resA = await getNotifications(getReqA);
      const dataA = await resA.json();

      assert.strictEqual(resA.status, 200);
      const notifIdsA = dataA.data.notifications.map((n: any) => n.id);
      assert.ok(notifIdsA.includes(notifA_private.id), "User A must see their own notification");
      assert.ok(notifIdsA.includes(notifA_broadcast.id), "User A must see org broadcast notification");
      assert.strictEqual(notifIdsA.includes(notifB_private.id), false, "User A must NEVER see Tenant B notification");

      // Colleague User A2 in same Org A: should see notifA_broadcast, but NOT notifA_private
      const getReqA2 = makeAuthRequest("http://localhost:3000/api/notifications", sessionDataA2.rawToken, "GET");
      const resA2 = await getNotifications(getReqA2);
      const dataA2 = await resA2.json();

      assert.strictEqual(resA2.status, 200);
      const notifIdsA2 = dataA2.data.notifications.map((n: any) => n.id);
      assert.ok(notifIdsA2.includes(notifA_broadcast.id), "Colleague A2 sees org broadcast");
      assert.strictEqual(notifIdsA2.includes(notifA_private.id), false, "Colleague A2 must NOT see User A's private notification");

      // Colleague User A2 marks notifications as read: should NOT mark User A's private notification as read
      const patchReqA2 = makeAuthRequest("http://localhost:3000/api/notifications", sessionDataA2.rawToken, "PATCH");
      const patchResA2 = await patchNotifications(patchReqA2);
      assert.strictEqual(patchResA2.status, 200);

      const refreshedNotifA = await prisma.notification.findUnique({ where: { id: notifA_private.id } });
      assert.strictEqual(refreshedNotifA?.isRead, false, "User A's unread private notification must remain unread");
    });

    // ------------------------------------------------------------------------
    // ATTACK 8: Search Boundary Isolation
    // ------------------------------------------------------------------------
    await t.test("Isolation Attack 8: Cross-Tenant Search Isolation", async () => {
      const searchReq = makeAuthRequest(
        `http://localhost:3000/api/search?q=Secret+Financials+B`,
        sessionDataA.rawToken,
        "GET"
      );

      const res = await searchEverything(searchReq);
      const data = await res.json();

      assert.strictEqual(res.status, 200);
      const results = data.data.results;
      const foundVictimItem = results.some((r: any) => r.title.includes("Secret Financials B"));
      assert.strictEqual(foundVictimItem, false, "Search must return zero results for another tenant's dataset");
    });

  } finally {
    // Clean up test data
    await prisma.notification.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.report.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.aPIKey.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.dataset.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [userA.id, userA2.id, userB.id] } },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userA2.id, userB.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
  }
});


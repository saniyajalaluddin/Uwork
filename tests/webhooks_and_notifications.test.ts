import test from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  generateWebhookSecret,
  createWebhookSubscription,
  listWebhookSubscriptions,
  updateWebhookSubscription,
  rotateWebhookSecret,
  deleteWebhookSubscription,
  deliverWebhookPayload,
  getWebhookDeliveryHistory,
} from "../src/services/webhook.service";
import {
  dispatchNotification,
  listNotifications,
  markNotificationsAsRead,
  deleteNotification,
} from "../src/services/notification.service";
import {
  GET as webhooksGetRoute,
  POST as webhooksPostRoute,
  PATCH as webhooksPatchRoute,
  DELETE as webhooksDeleteRoute,
} from "../src/app/api/webhooks/route";
import { POST as rotateSecretRoute } from "../src/app/api/webhooks/[id]/rotate-secret/route";
import { GET as deliveriesRoute } from "../src/app/api/webhooks/[id]/deliveries/route";
import {
  GET as notificationsGetRoute,
  PATCH as notificationsPatchRoute,
  DELETE as notificationsDeleteRoute,
} from "../src/app/api/notifications/route";
import { NextRequest } from "next/server";

test("Phase 19: Notification Center & Webhook Integration Hub", async (t) => {
  const timestamp = Date.now();

  // 1. Setup Tenant Alpha
  const orgA = await prisma.organization.create({
    data: {
      name: `Webhook Corp Alpha ${timestamp}`,
      slug: `webhook-alpha-${timestamp}`,
      planTier: "ENTERPRISE",
    },
  });

  const userA = await prisma.user.create({
    data: {
      email: `alpha_admin_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Alpha",
      lastName: "Admin",
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: orgA.id,
      userId: userA.id,
      role: "OWNER",
    },
  });

  const sessionA = await createSession(userA.id, orgA.id);

  // 2. Setup Tenant Beta (for IDOR tests)
  const orgB = await prisma.organization.create({
    data: {
      name: `Webhook Corp Beta ${timestamp}`,
      slug: `webhook-beta-${timestamp}`,
      planTier: "PRO",
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: `beta_admin_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Beta",
      lastName: "Admin",
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: orgB.id,
      userId: userB.id,
      role: "OWNER",
    },
  });

  const sessionB = await createSession(userB.id, orgB.id);

  // Helper for authenticated requests
  const createAuthRequest = (url: string, rawToken: string, options: { method?: string; body?: string } = {}) => {
    const headers = new Headers();
    headers.set("Cookie", `uwork_session=${rawToken}`);
    if (options.body) {
      headers.set("Content-Type", "application/json");
    }
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method: options.method || "GET",
      headers,
      body: options.body,
    });
  };

  // =========================================================================
  // SUBTEST 1: HMAC-SHA256 Signatures & Replay Attack Defense
  // =========================================================================
  await t.test("HMAC-SHA256 payload signing and verification with replay protection", async () => {
    const secret = generateWebhookSecret();
    assert.ok(secret.startsWith("whsec_"), "Generated secret must have whsec_ prefix");

    const payloadObj = {
      event: "forecast.completed",
      datasetId: "ds_12345",
      metrics: { confidence: 0.96, horizonDays: 30 },
    };
    const payloadStr = JSON.stringify(payloadObj);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(payloadStr, secret, nowSeconds);

    assert.ok(signature.length === 64, "SHA-256 signature must be 64 hex characters");

    // Valid verification
    const isValid = verifyWebhookSignature(signature, payloadStr, secret, nowSeconds, 300);
    assert.strictEqual(isValid, true, "Valid signature must verify successfully");

    // Tampered payload verification
    const tamperedStr = JSON.stringify({ ...payloadObj, datasetId: "ds_tampered" });
    const isTamperedValid = verifyWebhookSignature(signature, tamperedStr, secret, nowSeconds, 300);
    assert.strictEqual(isTamperedValid, false, "Tampered payload must fail verification");

    // Wrong secret verification
    const wrongSecret = generateWebhookSecret();
    const isWrongSecretValid = verifyWebhookSignature(signature, payloadStr, wrongSecret, nowSeconds, 300);
    assert.strictEqual(isWrongSecretValid, false, "Verification with wrong secret must fail");

    // Replay attack verification (expired timestamp outside tolerance)
    const oldTimestamp = nowSeconds - 600; // 10 minutes ago
    const expiredSig = signWebhookPayload(payloadStr, secret, oldTimestamp);
    const isExpiredValid = verifyWebhookSignature(expiredSig, payloadStr, secret, oldTimestamp, 300);
    assert.strictEqual(isExpiredValid, false, "Expired timestamp must fail due to replay defense");
  });

  // =========================================================================
  // SUBTEST 2: Webhook Subscription Lifecycle & Secret Management
  // =========================================================================
  let createdWebhookA: any = null;

  await t.test("Webhook subscription lifecycle and secret isolation", async () => {
    const created = await createWebhookSubscription({
      organizationId: orgA.id,
      name: "Alpha Slack Hub",
      url: "https://hooks.slack.com/services/T00/B00/X00",
      events: ["forecast.completed", "anomaly.detected"],
      userId: userA.id,
    });

    assert.ok(created.id, "Webhook must be created with an ID");
    assert.strictEqual(created.name, "Alpha Slack Hub");
    assert.strictEqual(created.events.length, 2);
    assert.ok(created.secret.startsWith("whsec_"), "Secret must be returned on creation");
    createdWebhookA = created;

    // List webhooks: Ensure list returns created webhook
    const list = await listWebhookSubscriptions(orgA.id);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, created.id);
    assert.strictEqual(list[0].name, "Alpha Slack Hub");

    // Update Webhook
    const updated = await updateWebhookSubscription({
      organizationId: orgA.id,
      webhookId: created.id,
      name: "Alpha Slack Alerts Updated",
      events: ["*"],
      isActive: true,
      userId: userA.id,
    });
    assert.strictEqual(updated.name, "Alpha Slack Alerts Updated");
    assert.strictEqual(updated.events[0], "*");

    // Rotate Secret
    const rotated = await rotateWebhookSecret({
      organizationId: orgA.id,
      webhookId: created.id,
      userId: userA.id,
    });
    assert.ok(rotated.newSecret.startsWith("whsec_"), "New secret must be generated on rotation");
    assert.notStrictEqual(rotated.newSecret, created.secret, "New secret must differ from old secret");

    // Verify DB record was updated
    const updatedDbRecord = await prisma.webhookSubscription.findUnique({
      where: { id: created.id },
    });
    assert.strictEqual(updatedDbRecord?.secret, rotated.newSecret, "DB secret must be updated");
    // Update local reference with rotated secret
    createdWebhookA = { ...createdWebhookA, ...updatedDbRecord, eventsJson: updatedDbRecord?.eventsJson };
  });

  // =========================================================================
  // SUBTEST 3: Webhook Delivery Engine, DLQ and Delivery History
  // =========================================================================
  await t.test("Webhook delivery attempt tracking and dead-letter queue transition", async () => {
    // Deliver to an unroutable endpoint to test failure tracking and DLQ
    const deliveryResult = await deliverWebhookPayload(
      createdWebhookA,
      "alert.triggered",
      { severity: "HIGH", message: "Memory usage exceeded 90%" },
      undefined,
      3 // Current attempt 3 out of 3 = moves to DEAD_LETTER
    );

    assert.ok(deliveryResult, "Delivery result should not be null");
    assert.ok(deliveryResult.deliveryId, "Delivery record ID must be generated");
    assert.ok(["RETRYING", "DEAD_LETTER", "FAILED"].includes(deliveryResult.status));

    // Verify delivery history query
    const history = await getWebhookDeliveryHistory(orgA.id, createdWebhookA.id);

    assert.ok(history.length >= 1, "History must contain at least 1 delivery record");
    const record = history[0];
    assert.strictEqual(record.event, "alert.triggered");
  });

  // =========================================================================
  // SUBTEST 4: In-App Notification Center
  // =========================================================================
  let notificationId1: string;
  let notificationId2: string;

  await t.test("In-app notification dispatch, unread tracking, and batch updates", async () => {
    // Dispatch 2 notifications
    const n1 = await dispatchNotification({
      organizationId: orgA.id,
      userId: userA.id,
      title: "New Forecast Available",
      message: "ARIMA model computed 30-day forward demand.",
      type: "FORECAST_COMPLETED",
      linkUrl: "/analytics",
    });
    notificationId1 = n1.id;

    const n2 = await dispatchNotification({
      organizationId: orgA.id,
      userId: userA.id,
      title: "System Performance Alert",
      message: "High API query volume detected.",
      type: "SECURITY_EVENT",
    });
    notificationId2 = n2.id;

    // List notifications
    const unreadList = await listNotifications({
      organizationId: orgA.id,
      userId: userA.id,
      isRead: false,
    });
    assert.strictEqual(unreadList.unreadCount, 2, "Unread count must be 2");
    assert.strictEqual(unreadList.notifications.length, 2);

    // Mark single notification as read
    await markNotificationsAsRead({
      organizationId: orgA.id,
      userId: userA.id,
      notificationId: notificationId1,
    });

    const updatedList = await listNotifications({
      organizationId: orgA.id,
      userId: userA.id,
    });
    assert.strictEqual(updatedList.unreadCount, 1, "Unread count must drop to 1");

    // Mark all remaining notifications as read
    await markNotificationsAsRead({
      organizationId: orgA.id,
      userId: userA.id,
    });

    const allReadList = await listNotifications({
      organizationId: orgA.id,
      userId: userA.id,
    });
    assert.strictEqual(allReadList.unreadCount, 0, "Unread count must be 0 after marking all read");

    // Delete single notification
    const deleteRes = await deleteNotification({
      organizationId: orgA.id,
      userId: userA.id,
      notificationId: notificationId2,
    });
    assert.strictEqual(deleteRes.success, true);
    assert.strictEqual(deleteRes.deletedId, notificationId2);

    const finalList = await listNotifications({
      organizationId: orgA.id,
      userId: userA.id,
    });
    assert.strictEqual(finalList.notifications.length, 1);
  });

  // =========================================================================
  // SUBTEST 5: REST API Route Validation & Multi-Tenant IDOR Attack Defense
  // =========================================================================
  await t.test("REST API endpoints enforce tenant isolation and IDOR protection", async () => {
    // 1. User A lists webhooks via GET /api/webhooks
    const getReqA = createAuthRequest("/api/webhooks", sessionA.rawToken);
    const getResA = await webhooksGetRoute(getReqA);
    const getDataA = await getResA.json();
    assert.strictEqual(getResA.status, 200);
    assert.strictEqual(getDataA.success, true);
    assert.strictEqual(getDataA.data.webhooks.length, 1);

    // 2. User B lists webhooks via GET /api/webhooks: Must see 0 webhooks (tenant isolation)
    const getReqB = createAuthRequest("/api/webhooks", sessionB.rawToken);
    const getResB = await webhooksGetRoute(getReqB);
    const getDataB = await getResB.json();
    assert.strictEqual(getResB.status, 200);
    assert.strictEqual(getDataB.data.webhooks.length, 0, "User B must not see User A's webhooks");

    // 3. IDOR Attack: User B attempts to rotate User A's webhook secret via POST /api/webhooks/[id]/rotate-secret
    const attackReq = createAuthRequest(
      `/api/webhooks/${createdWebhookA.id}/rotate-secret`,
      sessionB.rawToken,
      { method: "POST" }
    );
    const attackRes = await rotateSecretRoute(attackReq, {
      params: Promise.resolve({ id: createdWebhookA.id }),
    });
    assert.ok([403, 404].includes(attackRes.status), "IDOR cross-tenant secret rotation must be rejected");

    // 4. IDOR Attack: User B attempts to view User A's delivery logs via GET /api/webhooks/[id]/deliveries
    const logAttackReq = createAuthRequest(
      `/api/webhooks/${createdWebhookA.id}/deliveries`,
      sessionB.rawToken
    );
    const logAttackRes = await deliveriesRoute(logAttackReq, {
      params: Promise.resolve({ id: createdWebhookA.id }),
    });
    assert.ok([403, 404].includes(logAttackRes.status), "IDOR delivery history access must be rejected");

    // 5. IDOR Attack: User B attempts to delete User A's webhook via DELETE /api/webhooks?id=
    const delAttackReq = createAuthRequest(
      `/api/webhooks?id=${createdWebhookA.id}`,
      sessionB.rawToken,
      { method: "DELETE" }
    );
    const delAttackRes = await webhooksDeleteRoute(delAttackReq);
    assert.ok([403, 404].includes(delAttackRes.status), "IDOR cross-tenant webhook deletion must be rejected");

    // 6. User A accesses delivery logs: Must succeed
    const validLogReq = createAuthRequest(
      `/api/webhooks/${createdWebhookA.id}/deliveries`,
      sessionA.rawToken
    );
    const validLogRes = await deliveriesRoute(validLogReq, {
      params: Promise.resolve({ id: createdWebhookA.id }),
    });
    assert.strictEqual(validLogRes.status, 200);
    const validLogData = await validLogRes.json();
    assert.strictEqual(validLogData.success, true);
    assert.ok(Array.isArray(validLogData.data.deliveries));

    // 7. Notifications API: GET /api/notifications
    const notifGetReq = createAuthRequest("/api/notifications", sessionA.rawToken);
    const notifGetRes = await notificationsGetRoute(notifGetReq);
    assert.strictEqual(notifGetRes.status, 200);
    const notifGetData = await notifGetRes.json();
    assert.strictEqual(notifGetData.success, true);

    // 8. Clean up created webhook via DELETE /api/webhooks?id= by User A
    const validDelReq = createAuthRequest(
      `/api/webhooks?id=${createdWebhookA.id}`,
      sessionA.rawToken,
      { method: "DELETE" }
    );
    const validDelRes = await webhooksDeleteRoute(validDelReq);
    assert.strictEqual(validDelRes.status, 200);
  });
});


import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { eventBus, SSEEvent } from "../src/lib/events/event-bus";
import { AlertService } from "../src/services/alert.service";
import {
  GET as alertsGetRoute,
  POST as alertsPostRoute,
  PATCH as alertsPatchRoute,
  DELETE as alertsDeleteRoute,
} from "../src/app/api/alerts/route";
import { GET as sseRoute } from "../src/app/api/events/sse/route";
import { NextRequest } from "next/server";

test("Phase 15: Real-Time SSE/Live Alerting & Event Bus Architecture", async (t) => {
  const timestamp = Date.now();

  // Setup Tenant Alpha
  const orgA = await prisma.organization.create({
    data: {
      name: `RealTime Tenant Alpha ${timestamp}`,
      slug: `rt-alpha-${timestamp}`,
    },
  });

  const userA = await prisma.user.create({
    data: {
      email: `sse_lead_a_${timestamp}@example.com`,
      passwordHash: "dummy_pass_for_test",
      firstName: "RealTime",
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
      name: `RealTime Tenant Beta ${timestamp}`,
      slug: `rt-beta-${timestamp}`,
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: `sse_lead_b_${timestamp}@example.com`,
      passwordHash: "dummy_pass_for_test",
      firstName: "RealTime",
      lastName: "Beta",
    },
  });

  await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
  });

  const sessionB = await createSession(userB.id, orgB.id);

  await t.test("1. Multi-tenant Event Bus enforces channel isolation and supports reconnection replay", async () => {
    const receivedA: SSEEvent[] = [];
    const receivedB: SSEEvent[] = [];

    const unsubA = eventBus.subscribe(orgA.id, userA.id, (evt) => {
      receivedA.push(evt);
    });

    const unsubB = eventBus.subscribe(orgB.id, userB.id, (evt) => {
      receivedB.push(evt);
    });

    // Publish to Tenant Alpha
    const evtA1 = eventBus.publishToTenant(orgA.id, "DATASET_READY", { name: "Sales Q1" });
    const evtA2 = eventBus.publishToTenant(orgA.id, "FORECAST_COMPLETED", { championModel: "ARIMA" });

    // Publish to Tenant Beta
    const evtB1 = eventBus.publishToTenant(orgB.id, "NOTIFICATION", { text: "Beta alert" });

    assert.strictEqual(receivedA.length, 2, "Tenant Alpha must receive exactly its 2 events");
    assert.strictEqual(receivedA[0].type, "DATASET_READY");
    assert.strictEqual(receivedA[1].type, "FORECAST_COMPLETED");

    assert.strictEqual(receivedB.length, 1, "Tenant Beta must receive exactly its 1 event");
    assert.strictEqual(receivedB[0].type, "NOTIFICATION");

    // Test Reconnection Replay via getEventsSince
    const missedSinceFirst = eventBus.getEventsSince(orgA.id, evtA1.id);
    assert.strictEqual(missedSinceFirst.length, 1, "Must replay exactly 1 missed event since evtA1");
    assert.strictEqual(missedSinceFirst[0].id, evtA2.id);

    unsubA();
    unsubB();
  });

  await t.test("2. AlertService evaluates threshold breaches and enforces cooldown protection", async () => {
    // Create Alert Rule in Tenant Alpha
    const rule = await prisma.alert.create({
      data: {
        organizationId: orgA.id,
        name: "MoM Revenue Plunge Monitor",
        metricCode: "TOTAL_REVENUE",
        condition: "DROPS_BY_PCT",
        thresholdValue: 10, // 10% drop
        cooldownHours: 24,
        isActive: true,
      },
    });

    // 1st Evaluation: Baseline 100k, Current 85k (15% drop -> Breach!)
    const firedFirst = await AlertService.evaluateAlerts({
      organizationId: orgA.id,
      metricCode: "TOTAL_REVENUE",
      currentValue: 85000,
      baselineValue: 100000,
    });

    assert.strictEqual(firedFirst.length, 1, "Must fire on 15% drop (> 10% threshold)");
    assert.strictEqual(firedFirst[0].alertName, "MoM Revenue Plunge Monitor");

    // Verify Notification created in DB
    const notif = await prisma.notification.findUnique({
      where: { id: firedFirst[0].notificationId },
    });
    assert.ok(notif);
    assert.ok(notif.message.includes("Dropped by 15.0%"));

    // 2nd Evaluation immediately: Baseline 100k, Current 80k (20% drop)
    // Must be suppressed due to 24-hour cooldown
    const firedSecond = await AlertService.evaluateAlerts({
      organizationId: orgA.id,
      metricCode: "TOTAL_REVENUE",
      currentValue: 80000,
      baselineValue: 100000,
    });

    assert.strictEqual(firedSecond.length, 0, "Must suppress alert firing during active cooldown window");
  });

  await t.test("3. Alerts REST API enforces full CRUD and cross-tenant IDOR isolation", async () => {
    // 1. Tenant Alpha creates an alert
    const createReq = new NextRequest(new URL("http://localhost:3000/api/alerts"), {
      method: "POST",
      body: JSON.stringify({
        name: "Gross Margin Watchdog",
        metricCode: "MARGIN",
        condition: "LESS_THAN",
        thresholdValue: 60,
        cooldownHours: 12,
      }),
      headers: {
        cookie: `uwork_session=${sessionA.rawToken}`,
        "content-type": "application/json",
      },
    });

    const createRes = await alertsPostRoute(createReq);
    assert.strictEqual(createRes.status, 201);
    const createdJson = await createRes.json();
    assert.strictEqual(createdJson.success, true);
    const alertId = createdJson.data.alert.id;

    // 2. Tenant Beta attempts to tamper with Tenant Alpha's alert (IDOR Attack)
    const patchAttackReq = new NextRequest(new URL("http://localhost:3000/api/alerts"), {
      method: "PATCH",
      body: JSON.stringify({
        id: alertId,
        isActive: false,
      }),
      headers: {
        cookie: `uwork_session=${sessionB.rawToken}`,
        "content-type": "application/json",
      },
    });

    const patchAttackRes = await alertsPatchRoute(patchAttackReq);
    assert.strictEqual(patchAttackRes.status, 404, "Cross-tenant alert modification must return 404");

    // 3. Tenant Beta attempts to delete Tenant Alpha's alert (IDOR Attack)
    const deleteAttackReq = new NextRequest(new URL(`http://localhost:3000/api/alerts?id=${alertId}`), {
      method: "DELETE",
      headers: {
        cookie: `uwork_session=${sessionB.rawToken}`,
      },
    });

    const deleteAttackRes = await alertsDeleteRoute(deleteAttackReq);
    assert.strictEqual(deleteAttackRes.status, 404, "Cross-tenant alert deletion must return 404");

    // 4. Tenant Alpha successfully updates its alert
    const patchLegitReq = new NextRequest(new URL("http://localhost:3000/api/alerts"), {
      method: "PATCH",
      body: JSON.stringify({
        id: alertId,
        thresholdValue: 55,
      }),
      headers: {
        cookie: `uwork_session=${sessionA.rawToken}`,
        "content-type": "application/json",
      },
    });

    const patchLegitRes = await alertsPatchRoute(patchLegitReq);
    assert.strictEqual(patchLegitRes.status, 200);
    const patchJson = await patchLegitRes.json();
    assert.strictEqual(patchJson.data.alert.thresholdValue, 55);

    // 5. Tenant Alpha successfully deletes its alert
    const deleteLegitReq = new NextRequest(new URL(`http://localhost:3000/api/alerts?id=${alertId}`), {
      method: "DELETE",
      headers: {
        cookie: `uwork_session=${sessionA.rawToken}`,
      },
    });

    const deleteLegitRes = await alertsDeleteRoute(deleteLegitReq);
    assert.strictEqual(deleteLegitRes.status, 200);
  });

  await t.test("4. Server-Sent Events (SSE) route connects and delivers live stream messages", async () => {
    const sseReq = new NextRequest(new URL("http://localhost:3000/api/events/sse"), {
      method: "GET",
      headers: {
        cookie: `uwork_session=${sessionA.rawToken}`,
      },
    });

    const sseRes = await sseRoute(sseReq);
    assert.strictEqual(sseRes.status, 200);
    assert.ok(
      sseRes.headers.get("content-type")?.includes("text/event-stream"),
      "Response must have text/event-stream content type"
    );
    assert.strictEqual(sseRes.headers.get("connection"), "keep-alive");

    // Read the initial handshake chunk from the SSE stream
    const reader = sseRes.body?.getReader();
    assert.ok(reader);

    const { value, done } = await reader.read();
    assert.strictEqual(done, false);

    const text = new TextDecoder().decode(value);
    assert.ok(text.includes("event: CONNECTED"), "Must receive initial handshake CONNECTED event");
    assert.ok(text.includes(orgA.id), "Handshake must contain authenticated organizationId");

    await reader.cancel();
  });
});


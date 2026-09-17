import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { detectAnomalies, AnomalyDataPoint } from "../src/services/anomaly.service";
import { GET as getAnomaliesRoute, POST as postAnomaliesRoute, PATCH as patchAnomaliesRoute } from "../src/app/api/anomalies/route";
import { NextRequest } from "next/server";

test("Phase 7: Statistical Anomaly Engine and Lookahead Bias Elimination", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("AnomalyPass123!#");

  // Setup Tenant A
  const orgA = await prisma.organization.create({
    data: { name: `Anomaly Org A ${timestamp}`, slug: `anomaly-org-a-${timestamp}` },
  });
  const userA = await prisma.user.create({
    data: {
      email: `analyst_a_${timestamp}@example.com`,
      passwordHash,
      firstName: "Anomaly",
      lastName: "Hunter",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: userA.id, role: "ADMIN" },
  });
  const sessionA = await createSession(userA.id, orgA.id);

  // Setup Tenant B (Adversary)
  const orgB = await prisma.organization.create({
    data: { name: `Anomaly Org B ${timestamp}`, slug: `anomaly-org-b-${timestamp}` },
  });
  const userB = await prisma.user.create({
    data: {
      email: `adversary_b_${timestamp}@example.com`,
      passwordHash,
      firstName: "Adversary",
      lastName: "Tenant",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
  });
  const sessionB = await createSession(userB.id, orgB.id);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Elimination of Lookahead Bias (Strict Backward-Looking Baseline)
    // ------------------------------------------------------------------------
    await t.test("1. Temporal causality: future spikes do not contaminate prior baseline", () => {
      const points: AnomalyDataPoint[] = [];
      for (let d = 1; d <= 15; d++) {
        const date = `2025-01-${String(d).padStart(2, "0")}`;
        let value = 10000;
        if (d === 10) {
          value = 50000;
        }
        points.push({ date, value, segment: "Direct Sales" });
      }

      const anomalies = detectAnomalies(points, { windowSize: 5, zThreshold: 2.5 });

      const preSpikeAnomalies = anomalies.filter((a) => a.timestamp < "2025-01-10");
      assert.strictEqual(
        preSpikeAnomalies.length,
        0,
        "Prior points (days 1-9) must not be flagged or contaminated by future spike at day 10"
      );

      const day10Anomaly = anomalies.find((a) => a.timestamp === "2025-01-10");
      assert.ok(day10Anomaly, "Spike at day 10 must be detected as an anomaly");
      assert.strictEqual(day10Anomaly.observedValue, 50000);
      assert.strictEqual(day10Anomaly.expectedValue, 10000);
      assert.strictEqual(day10Anomaly.deviationPct, 400);
      assert.strictEqual(day10Anomaly.severity, "CRITICAL");
    });

    // ------------------------------------------------------------------------
    // TEST 2: Hampel Filter (MAD) Robustness Against Masking/Swamping
    // ------------------------------------------------------------------------
    await t.test("2. Hampel Filter (MAD) prevents masking of subsequent points", () => {
      const points: AnomalyDataPoint[] = [
        { date: "2025-02-01", value: 5000 },
        { date: "2025-02-02", value: 5100 },
        { date: "2025-02-03", value: 4950 },
        { date: "2025-02-04", value: 5050 },
        { date: "2025-02-05", value: 100000 },
        { date: "2025-02-06", value: 5000 },
        { date: "2025-02-07", value: 15000 },
        { date: "2025-02-08", value: 5100 },
        { date: "2025-02-09", value: 5050 },
        { date: "2025-02-10", value: 4900 },
      ];

      const anomalies = detectAnomalies(points, { windowSize: 5, zThreshold: 2.3 });

      const day5Anomaly = anomalies.find((a) => a.timestamp === "2025-02-05");
      assert.ok(day5Anomaly, "Extreme outlier at day 5 must be detected");
      assert.strictEqual(day5Anomaly.severity, "CRITICAL");

      const day7Anomaly = anomalies.find((a) => a.timestamp === "2025-02-07");
      assert.ok(day7Anomaly, "Secondary outlier at day 7 must NOT be masked by day 5");
    });

    // ------------------------------------------------------------------------
    // TEST 3: Multi-Factor Root Cause Attribution
    // ------------------------------------------------------------------------
    await t.test("3. Generates rich root-cause attribution and confidence scores", () => {
      const points: AnomalyDataPoint[] = [
        { date: "2025-03-01", value: 20000, segment: "North America" },
        { date: "2025-03-02", value: 20500, segment: "North America" },
        { date: "2025-03-03", value: 19800, segment: "North America" },
        { date: "2025-03-04", value: 20200, segment: "North America" },
        { date: "2025-03-05", value: 20100, segment: "North America" },
        { date: "2025-03-06", value: 3000, segment: "North America" },
      ];

      const anomalies = detectAnomalies(points, { windowSize: 5 });
      assert.strictEqual(anomalies.length, 1);

      const a = anomalies[0];
      assert.strictEqual(a.timestamp, "2025-03-06");
      assert.ok(a.deviationPct < -80, "Should record an ~85% drop");
      assert.strictEqual(a.rootCause.segment, "North America");
      assert.ok(a.rootCause.factor.includes("drop"), "Factor text should indicate a drop");
      assert.ok(a.rootCause.factor.includes("Observed: $3,000"));
      assert.ok(a.rootCause.confidenceScore >= 0.7 && a.rootCause.confidenceScore <= 1.0);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Multi-Tenant API Protection and IDOR Defense (POST, GET, PATCH)
    // ------------------------------------------------------------------------
    await t.test("4. API enforces tenant boundaries and IDOR isolation", async () => {
      const postReqA = new NextRequest("http://localhost:3000/api/anomalies", {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          cookie: `uwork_session=${sessionA.rawToken}`,
        }),
        body: JSON.stringify({
          metricName: "ARR",
          points: [
            { date: "2025-04-01", value: 50000 },
            { date: "2025-04-02", value: 50200 },
            { date: "2025-04-03", value: 49800 },
            { date: "2025-04-04", value: 50100 },
            { date: "2025-04-05", value: 50050 },
            { date: "2025-04-06", value: 150000 },
          ],
        }),
      });

      const postResA = await postAnomaliesRoute(postReqA);
      assert.strictEqual(postResA.status, 200);
      const postDataA = await postResA.json();
      assert.strictEqual(postDataA.success, true);
      assert.strictEqual(postDataA.data.detectedCount, 1);

      const notificationA = await prisma.notification.findFirst({
        where: { organizationId: orgA.id, type: "ANOMALY_ALERT" },
      });
      assert.ok(notificationA, "Org A should receive notification for CRITICAL anomaly");

      const notificationB = await prisma.notification.findFirst({
        where: { organizationId: orgB.id },
      });
      assert.strictEqual(notificationB, null, "Org B must not receive Org A notifications");

      const getReqA = new NextRequest("http://localhost:3000/api/anomalies", {
        headers: new Headers({ cookie: `uwork_session=${sessionA.rawToken}` }),
      });
      const getResA = await getAnomaliesRoute(getReqA);
      const getDataA = await getResA.json();
      assert.strictEqual(getDataA.data.anomalies.length, 1);
      const anomalyAId = getDataA.data.anomalies[0].id;
      assert.strictEqual(getDataA.data.anomalies[0].isAcknowledged, false);

      const getReqB = new NextRequest("http://localhost:3000/api/anomalies", {
        headers: new Headers({ cookie: `uwork_session=${sessionB.rawToken}` }),
      });
      const getResB = await getAnomaliesRoute(getReqB);
      const getDataB = await getResB.json();
      assert.strictEqual(getDataB.data.anomalies.length, 0, "Org B should see zero anomalies");

      const patchIdorReq = new NextRequest("http://localhost:3000/api/anomalies", {
        method: "PATCH",
        headers: new Headers({
          "Content-Type": "application/json",
          cookie: `uwork_session=${sessionB.rawToken}`,
        }),
        body: JSON.stringify({
          anomalyId: anomalyAId,
          isAcknowledged: true,
        }),
      });
      const patchIdorRes = await patchAnomaliesRoute(patchIdorReq);
      assert.strictEqual(patchIdorRes.status, 404, "Adversary Org B must receive 404 on Org A anomaly ID");

      const patchLegitReq = new NextRequest("http://localhost:3000/api/anomalies", {
        method: "PATCH",
        headers: new Headers({
          "Content-Type": "application/json",
          cookie: `uwork_session=${sessionA.rawToken}`,
        }),
        body: JSON.stringify({
          anomalyId: anomalyAId,
          isAcknowledged: true,
        }),
      });
      const patchLegitRes = await patchAnomaliesRoute(patchLegitReq);
      assert.strictEqual(patchLegitRes.status, 200);
      const patchLegitData = await patchLegitRes.json();
      assert.strictEqual(patchLegitData.data.anomaly.isAcknowledged, true);
    });
  } finally {
    await prisma.notification.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.anomaly.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.datasetVersion.deleteMany({
      where: { dataset: { organizationId: { in: [orgA.id, orgB.id] } } },
    });
    await prisma.dataset.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
  }
});


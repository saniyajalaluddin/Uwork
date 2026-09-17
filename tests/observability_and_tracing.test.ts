import test from "node:test";
import assert from "node:assert";
import {
  logger,
  getRecentLogs,
  clearLogBuffer,
  incrementCounter,
  recordDuration,
  setGauge,
  getMetricsSnapshot,
  clearMetrics,
  runWithContext,
  extractOrGenerateCorrelationId,
} from "../src/lib/observability";
import { successResponse, errorResponse } from "../src/lib/api/response";
import { withObservability } from "../src/lib/api/middleware";
import { GET as metricsRoute } from "../src/app/api/observability/metrics/route";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { NextRequest } from "next/server";

test("Phase 12: Production Logging, Correlation IDs & Observability Pipeline", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("ObsPass123!#");

  // Setup Test Tenant
  const org = await prisma.organization.create({
    data: { name: `Obs Org ${timestamp}`, slug: `obs-org-${timestamp}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `obs_admin_${timestamp}@example.com`,
      passwordHash,
      firstName: "Obs",
      lastName: "Admin",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: admin.id, role: "ADMIN" },
  });
  const sessionAdmin = await createSession(admin.id, org.id);

  // Viewer user for RBAC test
  const viewer = await prisma.user.create({
    data: {
      email: `obs_viewer_${timestamp}@example.com`,
      passwordHash,
      firstName: "Obs",
      lastName: "Viewer",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: viewer.id, role: "VIEWER" },
  });
  const sessionViewer = await createSession(viewer.id, org.id);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Structured Logger & AsyncLocalStorage Context Binding
    // ------------------------------------------------------------------------
    await t.test("1. Structured Logger injects correlationId, tenant, user, and error stack", () => {
      clearLogBuffer();

      const testCorrId = `corr_test_${timestamp}`;
      const testOrgId = org.id;
      const testUserId = admin.id;

      runWithContext(
        {
          correlationId: testCorrId,
          organizationId: testOrgId,
          userId: testUserId,
          startTime: Date.now(),
        },
        () => {
          // Standard info log
          const entry1 = logger.info("Processing financial batch run", { batchId: "b-101" }, 12.5);
          assert.ok(entry1);
          assert.strictEqual(entry1.level, "INFO");
          assert.strictEqual(entry1.correlationId, testCorrId);
          assert.strictEqual(entry1.organizationId, testOrgId);
          assert.strictEqual(entry1.userId, testUserId);
          assert.strictEqual(entry1.durationMs, 12.5);

          // Error log with Error object
          const sampleError = new Error("Database connection timeout during forecast calculation");
          (sampleError as any).code = "DB_TIMEOUT";
          const entry2 = logger.error("Fatal worker failure", sampleError);
          assert.ok(entry2);
          assert.strictEqual(entry2.level, "ERROR");
          assert.strictEqual(entry2.correlationId, testCorrId);
          assert.ok(entry2.error);
          assert.strictEqual(entry2.error.message, "Database connection timeout during forecast calculation");
          assert.strictEqual(entry2.error.code, "DB_TIMEOUT");
          assert.ok(entry2.error.stack);

          // Child logger inheritance
          const workerLogger = logger.child({ component: "ArimaSolver" });
          const entry3 = workerLogger.info("OLS matrix inverted successfully");
          assert.ok(entry3);
          assert.strictEqual(entry3.component, "ArimaSolver");
          assert.strictEqual(entry3.correlationId, testCorrId);
        }
      );

      // Verify log buffer retrieval
      const buffer = getRecentLogs({ correlationId: testCorrId });
      assert.strictEqual(buffer.length, 3);
    });

    // ------------------------------------------------------------------------
    // TEST 2: Metrics Collector & High-Throughput Percentiles
    // ------------------------------------------------------------------------
    await t.test("2. Metrics engine calculates counters, gauges, and percentile distributions", () => {
      clearMetrics();

      // Counters
      incrementCounter("ml_predictions_total", 1, { model: "ARIMA" });
      incrementCounter("ml_predictions_total", 4, { model: "ARIMA" });
      incrementCounter("ml_predictions_total", 2, { model: "HOLT_WINTERS" });

      // Gauges
      setGauge("active_worker_threads", 8);

      // Histograms with known statistical distributions (10ms through 100ms)
      for (let i = 1; i <= 100; i++) {
        recordDuration("forecasting_latency_ms", i, { engine: "OLS" });
      }

      const snapshot = getMetricsSnapshot();

      // Validate counters
      assert.strictEqual(snapshot.counters['ml_predictions_total{model="ARIMA"}'], 5);
      assert.strictEqual(snapshot.counters['ml_predictions_total{model="HOLT_WINTERS"}'], 2);

      // Validate gauges
      assert.strictEqual(snapshot.gauges["active_worker_threads"], 8);

      // Validate histogram metrics
      const hist = snapshot.histograms['forecasting_latency_ms{engine="OLS"}'];
      assert.ok(hist);
      assert.strictEqual(hist.count, 100);
      assert.strictEqual(hist.min, 1);
      assert.strictEqual(hist.max, 100);
      assert.strictEqual(hist.avg, 50.5);
      assert.strictEqual(hist.p50, 50.5);
      assert.strictEqual(hist.p90, 90.1);
      assert.strictEqual(hist.p95, 95.05);
      assert.strictEqual(hist.p99, 99.01);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Correlation ID Header Propagation & withObservability Wrapper
    // ------------------------------------------------------------------------
    await t.test("3. Request tracing preserves client correlation headers across HTTP lifecycle", async () => {
      // 1. Direct successResponse outside context generates fallback ID
      const directRes = successResponse({ status: "ok" });
      const generatedId = directRes.headers.get("x-correlation-id");
      assert.ok(generatedId);
      assert.ok(generatedId.startsWith("req_"));
      assert.strictEqual(directRes.headers.get("x-request-id"), generatedId);

      const directData = await directRes.json();
      assert.strictEqual(directData.meta.requestId, generatedId);

      // 2. withObservability passes custom client trace header through to response
      const clientTraceId = `trace-uuid-${timestamp}-abc`;
      const clientReq = new NextRequest("http://localhost:3000/api/test", {
        headers: new Headers({
          "x-correlation-id": clientTraceId,
        }),
      });

      const monitoredRes = await withObservability(clientReq, async (ctx) => {
        assert.strictEqual(ctx.correlationId, clientTraceId);
        return successResponse({ verified: true });
      });

      assert.strictEqual(monitoredRes.headers.get("x-correlation-id"), clientTraceId);
      assert.strictEqual(monitoredRes.headers.get("x-request-id"), clientTraceId);

      const monitoredData = await monitoredRes.json();
      assert.strictEqual(monitoredData.meta.requestId, clientTraceId);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Observability Metrics REST Endpoint
    // ------------------------------------------------------------------------
    await t.test("4. GET /api/observability/metrics provides telemetry and enforces RBAC", async () => {
      // 1. Viewer cannot access metrics (403 Forbidden)
      const viewerReq = new NextRequest("http://localhost:3000/api/observability/metrics", {
        method: "GET",
        headers: new Headers({
          cookie: `uwork_session=${sessionViewer.rawToken}`,
        }),
      });
      const viewerRes = await metricsRoute(viewerReq);
      assert.strictEqual(viewerRes.status, 403);

      // 2. Admin can access telemetry metrics (200 OK)
      const adminReq = new NextRequest("http://localhost:3000/api/observability/metrics", {
        method: "GET",
        headers: new Headers({
          cookie: `uwork_session=${sessionAdmin.rawToken}`,
        }),
      });
      const adminRes = await metricsRoute(adminReq);
      assert.strictEqual(adminRes.status, 200);

      const adminData = await adminRes.json();
      assert.strictEqual(adminData.success, true);
      assert.ok(adminData.data.system);
      assert.ok(adminData.data.system.service.includes("UWORK"));
      assert.ok(adminData.data.system.memoryUsageMB.heapUsed > 0);
      assert.ok(adminData.data.metrics);
      assert.ok(adminData.data.metrics.counters);
      assert.ok(adminData.data.metrics.histograms);
    });
  } finally {
    // Cleanup
    await prisma.session.deleteMany({
      where: { userId: { in: [admin.id, viewer.id] } },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [admin.id, viewer.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: org.id },
    });
  }
});


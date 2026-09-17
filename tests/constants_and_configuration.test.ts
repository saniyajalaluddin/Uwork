import test from "node:test";
import assert from "node:assert";
import { AppConfig } from "../src/config/app.config";
import { generateForecast, TimeSeriesPoint } from "../src/services/forecasting.service";
import { detectAnomalies, AnomalyDataPoint } from "../src/services/anomaly.service";
import { enqueueJob } from "../src/services/job-queue.service";
import { GET as healthRoute } from "../src/app/api/health/route";
import { GET as benefitsRoute } from "../src/app/api/org/benefits/route";
import { POST as uploadRoute } from "../src/app/api/datasets/upload/route";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { NextRequest } from "next/server";

test("Phase 11: Hardcoded Constants Centralization & System Packaging", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("ConfigPass123!#");

  // Setup Test Tenant
  const org = await prisma.organization.create({
    data: { name: `Config Tenant ${timestamp}`, slug: `config-tenant-${timestamp}` },
  });
  const admin = await prisma.user.create({
    data: {
      email: `config_admin_${timestamp}@example.com`,
      passwordHash,
      firstName: "Config",
      lastName: "Admin",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: admin.id, role: "ADMIN" },
  });
  const session = await createSession(admin.id, org.id);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: AppConfig Schema & Centralized System Metadata
    // ------------------------------------------------------------------------
    await t.test("1. Centralizes all system parameters, metadata, and security constants", () => {
      // System & packaging
      assert.strictEqual(AppConfig.system.version, "1.0.0");
      assert.strictEqual(AppConfig.system.shortName, "UWORK");
      assert.ok(AppConfig.system.serviceName.includes("UWORK"));
      assert.ok(AppConfig.system.baseUrl.length > 0);

      // Auth & Security
      assert.strictEqual(AppConfig.auth.sessionExpiryDays, 7);
      assert.strictEqual(AppConfig.auth.maxFailedLoginAttempts, 5);
      assert.strictEqual(AppConfig.auth.lockoutDurationMinutes, 15);
      assert.strictEqual(AppConfig.auth.lockoutDurationMs, 15 * 60 * 1000);
      assert.strictEqual(AppConfig.auth.apiKeyPrefix, "uw_live_");

      // Storage & Ingestion
      assert.strictEqual(AppConfig.storage.maxUploadSizeMB, 50);
      assert.strictEqual(AppConfig.storage.maxUploadSizeBytes, 50 * 1024 * 1024);
      assert.ok(AppConfig.storage.allowedExtensions.includes(".csv"));
      assert.ok(AppConfig.storage.allowedExtensions.includes(".xlsx"));

      // Forecasting
      assert.strictEqual(AppConfig.forecasting.defaultHorizonPeriods, 6);
      assert.strictEqual(AppConfig.forecasting.defaultConfidenceLevel, 0.95);
      assert.strictEqual(AppConfig.forecasting.validationHoldoutRatio, 0.25);

      // Anomaly Detection
      assert.strictEqual(AppConfig.anomalies.defaultWindowSize, 5);
      assert.strictEqual(AppConfig.anomalies.zScoreThreshold, 2.3);
      assert.strictEqual(AppConfig.anomalies.madConsistencyMultiplier, 1.4826);
      assert.strictEqual(AppConfig.anomalies.severity.criticalDeviationPct, 150);

      // Job Queue
      assert.strictEqual(AppConfig.jobs.defaultMaxAttempts, 3);
      assert.strictEqual(AppConfig.jobs.staleLockThresholdMs, 5 * 60 * 1000);

      // Quotas
      assert.strictEqual(AppConfig.quotas.enterprise.maxRows, 10000000);
      assert.strictEqual(AppConfig.quotas.enterprise.maxStorageBytes, 100 * 1024 * 1024 * 1024);
      assert.strictEqual(AppConfig.quotas.enterprise.maxTeamSeats, 50);
    });

    // ------------------------------------------------------------------------
    // TEST 2: Core Domain Engines Default to Centralized Constants
    // ------------------------------------------------------------------------
    await t.test("2. Forecasting, Anomaly, and Job engines consume centralized defaults", async () => {
      // 1. Forecasting engine defaults
      const sampleSeries: TimeSeriesPoint[] = [
        { date: "2025-01-01", value: 100 },
        { date: "2025-02-01", value: 110 },
        { date: "2025-03-01", value: 120 },
        { date: "2025-04-01", value: 130 },
        { date: "2025-05-01", value: 140 },
        { date: "2025-06-01", value: 150 },
        { date: "2025-07-01", value: 160 },
        { date: "2025-08-01", value: 170 },
      ];
      const forecast = generateForecast(sampleSeries);
      const futurePredictions = forecast.predictions.filter((p) => p.isForecast);
      assert.strictEqual(
        futurePredictions.length,
        AppConfig.forecasting.defaultHorizonPeriods,
        `Should generate default ${AppConfig.forecasting.defaultHorizonPeriods} forward periods`
      );

      // 2. Anomaly engine defaults
      const samplePoints: AnomalyDataPoint[] = [
        { date: "2025-01-01", value: 100 },
        { date: "2025-02-01", value: 102 },
        { date: "2025-03-01", value: 101 },
        { date: "2025-04-01", value: 103 },
        { date: "2025-05-01", value: 100 },
        { date: "2025-06-01", value: 450 }, // extreme spike > 150%
      ];
      const anomalies = detectAnomalies(samplePoints);
      assert.strictEqual(anomalies.length, 1);
      assert.strictEqual(anomalies[0].severity, "CRITICAL");
      assert.ok(Math.abs(anomalies[0].deviationPct) > AppConfig.anomalies.severity.criticalDeviationPct);

      // 3. Job Queue defaults
      const testJob = await enqueueJob({
        organizationId: org.id,
        jobType: "DATA_CLEANING",
        payload: { test: true },
      });
      assert.strictEqual(testJob.maxAttempts, AppConfig.jobs.defaultMaxAttempts);
      await prisma.job.delete({ where: { id: testJob.id } });
    });

    // ------------------------------------------------------------------------
    // TEST 3: REST Endpoints Mirror Centralized Config
    // ------------------------------------------------------------------------
    await t.test("3. REST API routes reflect centralized configuration values", async () => {
      // 1. Health API
      const healthRes = await healthRoute();
      assert.strictEqual(healthRes.status, 200);
      const healthData = await healthRes.json();
      assert.strictEqual(healthData.service, AppConfig.system.serviceName);
      assert.strictEqual(healthData.version, AppConfig.system.version);

      // 2. Benefits & Quotas API
      const benefitsReq = new NextRequest("http://localhost:3000/api/org/benefits", {
        method: "GET",
        headers: new Headers({
          cookie: `uwork_session=${session.rawToken}`,
        }),
      });
      const benefitsRes = await benefitsRoute(benefitsReq);
      assert.strictEqual(benefitsRes.status, 200);
      const benefitsData = await benefitsRes.json();
      assert.strictEqual(benefitsData.success, true);
      assert.strictEqual(benefitsData.data.benefits.quotas.rows.limit, AppConfig.quotas.enterprise.maxRows);
      assert.strictEqual(benefitsData.data.benefits.quotas.storage.limitBytes, AppConfig.quotas.enterprise.maxStorageBytes);
      assert.strictEqual(benefitsData.data.benefits.quotas.teamSeats.limit, AppConfig.quotas.enterprise.maxTeamSeats);
      assert.strictEqual(benefitsData.data.benefits.quotas.sla, AppConfig.quotas.enterprise.slaAvailability);

      // 3. Dataset Upload File Size Limit Enforcement
      // Create a mock multipart form data with a file exceeding MAX_FILE_SIZE (50MB + 1KB)
      const oversizedBlob = new Blob([new Uint8Array(50 * 1024 * 1024 + 1024)], { type: "text/csv" });
      const oversizedForm = new FormData();
      oversizedForm.append("file", oversizedBlob, "huge_dataset.csv");

      const uploadReq = new NextRequest("http://localhost:3000/api/datasets/upload", {
        method: "POST",
        headers: new Headers({
          cookie: `uwork_session=${session.rawToken}`,
        }),
        body: oversizedForm,
      });

      const uploadRes = await uploadRoute(uploadReq);
      assert.strictEqual(uploadRes.status, 413);
      const uploadData = await uploadRes.json();
      assert.ok(uploadData.error.message.includes(`${AppConfig.storage.maxUploadSizeMB}MB`));
    });
  } finally {
    // Cleanup
    await prisma.session.deleteMany({
      where: { userId: admin.id },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.user.deleteMany({
      where: { id: admin.id },
    });
    await prisma.organization.deleteMany({
      where: { id: org.id },
    });
  }
});


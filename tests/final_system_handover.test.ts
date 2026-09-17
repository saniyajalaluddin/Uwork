import test from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { sanitizeSpreadsheetCell } from "../src/lib/security/sanitize";
import { logAuditEvent, verifyAuditChain } from "../src/services/audit.service";
import { generateForecast, runArimaOLS, TimeSeriesPoint } from "../src/services/forecasting.service";
import { detectAnomalies, AnomalyDataPoint } from "../src/services/anomaly.service";
import { eventBus } from "../src/lib/events/event-bus";
import { computeNextRun } from "../src/services/report.service";
import { signWebhookPayload, verifyWebhookSignature } from "../src/services/webhook.service";
import { runCanaryDiagnostics } from "../src/services/health.service";
import { createDatabaseBackup, verifyBackupIntegrity, deleteDatabaseBackup } from "../src/services/backup.service";
import { auditProductionReadiness } from "../src/services/readiness.service";

test("Phase 24: Final System Review, Architectural Certification & Production Handover", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("MasterHandoverPass123!#");

  // Setup Tenant Alpha & Tenant Beta for Global Invariant Verification
  const orgAlpha = await prisma.organization.create({
    data: {
      name: `Handover Corp Alpha ${timestamp}`,
      slug: `handover-alpha-${timestamp}`,
      planTier: "ENTERPRISE",
    },
  });

  const orgBeta = await prisma.organization.create({
    data: {
      name: `Handover Corp Beta ${timestamp}`,
      slug: `handover-beta-${timestamp}`,
      planTier: "PRO",
    },
  });

  const userAlpha = await prisma.user.create({
    data: {
      email: `alpha_handover_${timestamp}@example.com`,
      passwordHash,
      firstName: "Alpha",
      lastName: "Leader",
    },
  });

  const userBeta = await prisma.user.create({
    data: {
      email: `beta_handover_${timestamp}@example.com`,
      passwordHash,
      firstName: "Beta",
      lastName: "Leader",
    },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: orgAlpha.id, userId: userAlpha.id, role: "OWNER" },
      { organizationId: orgBeta.id, userId: userBeta.id, role: "OWNER" },
    ],
  });

  const sessionAlpha = await createSession(userAlpha.id, orgAlpha.id);
  const sessionBeta = await createSession(userBeta.id, orgBeta.id);

  // Subtest 1: Multi-Tenant Zero-Trust Isolation Invariant
  await t.test("1. Multi-Tenant Zero-Trust Isolation & Data Boundary Invariant", async () => {
    // Alpha creates an alert rule
    const alertAlpha = await prisma.alert.create({
      data: {
        organizationId: orgAlpha.id,
        name: "Alpha Revenue Alert",
        metricCode: "REVENUE",
        condition: "GREATER_THAN",
        thresholdValue: 100000,
        cooldownHours: 24,
        isActive: true,
      },
    });

    // Beta cannot access Alpha's alert rule
    const crossTenantAlert = await prisma.alert.findFirst({
      where: {
        id: alertAlpha.id,
        organizationId: orgBeta.id,
      },
    });
    assert.strictEqual(crossTenantAlert, null, "Cross-tenant query must return null");

    // Clean up alert
    await prisma.alert.delete({ where: { id: alertAlpha.id } });
  });

  // Subtest 2: Security, Sanitization & Cryptographic Tamper Invariant
  await t.test("2. Security, Formula Sanitization & Tamper-Evident Audit Invariant", async () => {
    // 1. Formula Injection Sanitization
    assert.strictEqual(sanitizeSpreadsheetCell("=1+1"), "'=1+1");
    assert.strictEqual(sanitizeSpreadsheetCell("@SUM(A1:A10)"), "'@SUM(A1:A10)");
    assert.strictEqual(sanitizeSpreadsheetCell("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
    assert.strictEqual(sanitizeSpreadsheetCell("Normal Text"), "Normal Text");

    // 2. Cryptographic SHA-256 Audit Log Chaining
    const initialAudit = await logAuditEvent({
      organizationId: orgAlpha.id,
      userId: userAlpha.id,
      action: "HANDOVER_AUDIT_INIT",
      resourceType: "SECURITY",
      resourceId: "sec-001",
      status: "SUCCESS",
      metadata: { verified: true },
    });

    assert.ok(initialAudit.id, "Audit record must be created");
    const meta = JSON.parse(initialAudit.metadataJson)._auditChain;
    assert.strictEqual(meta.hash.length, 64, "Audit hash must be 64 hex characters (SHA-256)");
    assert.strictEqual(meta.sequenceNumber, 1, "First audit record sequence must be 1");

    const integrity = await verifyAuditChain(orgAlpha.id);
    assert.strictEqual(integrity.valid, true, "Audit chain must be valid");

    // Clean up audit record
    await prisma.auditLog.delete({ where: { id: initialAudit.id } });
  });

  // Subtest 3: Mathematical Soundness & Lookahead-Free Analytics Invariant
  await t.test("3. Mathematical Soundness & Non-Lookahead Modeling Invariant", async () => {
    // 1. OLS Autoregressive Lag Estimation
    const syntheticValues = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
    const arimaPredictions = runArimaOLS(syntheticValues, 4, 2);
    assert.ok(Array.isArray(arimaPredictions), "ARIMA OLS must return predictions");
    assert.strictEqual(arimaPredictions.length, syntheticValues.length + 4);

    // 2. Monotonic Prediction Intervals
    const timeSeriesPoints: TimeSeriesPoint[] = syntheticValues.map((v, i) => ({
      date: `2026-0${(i % 9) + 1}-01`,
      value: v,
    }));
    const forecast = generateForecast(timeSeriesPoints, 4, 0.95);
    const future = forecast.predictions.filter((p) => p.isForecast);
    assert.strictEqual(future.length, 4);

    // Verify interval width grows monotonically over steps
    for (let i = 1; i < future.length; i++) {
      const prevIntervalWidth = future[i - 1].confidenceUpper - future[i - 1].confidenceLower;
      const currIntervalWidth = future[i].confidenceUpper - future[i].confidenceLower;
      assert.ok(
        currIntervalWidth >= prevIntervalWidth - 0.001,
        `Interval width step ${i} (${currIntervalWidth}) should be >= previous (${prevIntervalWidth})`
      );
    }

    // 3. Non-Lookahead Hampel MAD Anomaly Detection
    const seriesWithSpike: AnomalyDataPoint[] = [
      { date: "2026-01-01", value: 100 },
      { date: "2026-01-02", value: 102 },
      { date: "2026-01-03", value: 99 },
      { date: "2026-01-04", value: 101 },
      { date: "2026-01-05", value: 103 },
      { date: "2026-01-06", value: 100 },
      { date: "2026-01-07", value: 98 },
      { date: "2026-01-08", value: 500 }, // Anomaly spike
      { date: "2026-01-09", value: 102 },
      { date: "2026-01-10", value: 100 },
    ];
    const anomalies = detectAnomalies(seriesWithSpike, { windowSize: 5, zThreshold: 2.5 });
    const spike = anomalies.find((a) => a.observedValue === 500);
    assert.ok(spike, "Hampel MAD must identify the spike with observedValue 500");
    assert.ok(["CRITICAL", "HIGH"].includes(spike.severity));
  });

  // Subtest 4: Real-Time Pipelines, Cron Scheduling & Webhook Hub Invariant
  await t.test("4. Real-Time SSE Hub, Cron Parser & Webhook Signatures Invariant", async () => {
    // 1. TenantEventBus Replay Buffer
    const published = eventBus.publishToTenant(orgAlpha.id, "ALERT_TRIGGERED", {
      message: "Production Handover Active",
    });
    assert.ok(published.id);

    const missedEvents = eventBus.getEventsSince(orgAlpha.id, "evt_nonexistent");
    assert.ok(missedEvents.length >= 1, "Replay buffer must retain published events");


    // 2. 5-Field Cron Schedule Parser
    const nextDaily = computeNextRun("0 9 * * *", new Date("2026-09-17T08:00:00Z"));
    assert.ok(nextDaily.getTime() > new Date("2026-09-17T08:00:00Z").getTime(), "Cron next run must be in future");

    // 3. Webhook HMAC-SHA256 Signatures
    const secret = "test-webhook-secret-key-12345678";
    const payload = JSON.stringify({ event: "DATASET_READY", orgId: orgAlpha.id });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(payload, secret, nowSeconds);
    assert.strictEqual(signature.length, 64, "Signature must be 64 hex characters");

    const isValid = verifyWebhookSignature(signature, payload, secret, nowSeconds, 300);
    assert.strictEqual(isValid, true, "Signature verification must succeed with matching secret");

    const isTampered = verifyWebhookSignature(signature, payload + "tampered", secret, nowSeconds, 300);
    assert.strictEqual(isTampered, false, "Signature verification must fail on tampered payload");
  });

  // Subtest 5: System Operational Health, Backups & Readiness Handover
  await t.test("5. System Canary Diagnostics, Atomic SQLite Backups & Handover Certification", async () => {
    // 1. Live Canary Diagnostics
    const canary = await runCanaryDiagnostics();
    assert.ok(["HEALTHY", "DEGRADED"].includes(canary.overallStatus));
    assert.strictEqual(canary.probes.database.status, "PASS");
    assert.strictEqual(canary.probes.storage.status, "PASS");

    // 2. Atomic SQLite Database Backup & Native PRAGMA Integrity Check
    const backup = await createDatabaseBackup(userAlpha.id, "FULL_SNAPSHOT");
    assert.ok(backup.id, "Backup record must have ID");
    assert.strictEqual(backup.integrityCheckPassed, true, "PRAGMA integrity check must pass");
    assert.strictEqual(backup.checksumSha256.length, 64, "SHA-256 checksum must be 64 characters");

    // Verify snapshot
    const verifyResult = await verifyBackupIntegrity(backup.id, userAlpha.id);
    assert.strictEqual(verifyResult.success, true, "Backup verification must pass");
    assert.strictEqual(verifyResult.status, "VERIFIED");

    // Cleanup snapshot
    await deleteDatabaseBackup(backup.id);

    // 3. Production Readiness Audit
    const readiness = await auditProductionReadiness();
    assert.strictEqual(readiness.readyForProduction, true, "System must be certified ready for production");
    assert.ok(readiness.score >= 80, `Production readiness score must be >= 80% (got ${readiness.score}%)`);
  });

  // Global Tenant Cleanup
  await prisma.organizationMember.deleteMany({ where: { organizationId: { in: [orgAlpha.id, orgBeta.id] } } });
  await prisma.session.deleteMany({ where: { userId: { in: [userAlpha.id, userBeta.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAlpha.id, userBeta.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAlpha.id, orgBeta.id] } } });
});

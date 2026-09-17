import test from "node:test";
import assert from "node:assert";
import { validatePasswordStrength } from "../src/lib/auth/password";
import { sanitizeSpreadsheetCell } from "../src/lib/security/sanitize";
import { checkRateLimit } from "../src/lib/security/rate-limiter";
import { profileDataset } from "../src/services/profiler.service";
import { generateForecast } from "../src/services/forecasting.service";
import { detectAnomalies } from "../src/services/anomaly.service";
import { computeBusinessHealthScore } from "../src/services/health-score.service";

// Test 1: Password Strength Validation
test("Security: Password strength validator enforces enterprise complexity", () => {
  assert.strictEqual(validatePasswordStrength("short").valid, false);
  assert.strictEqual(validatePasswordStrength("nouppercase123!").valid, false);
  assert.strictEqual(validatePasswordStrength("NOLOWERCASE123!").valid, false);
  assert.strictEqual(validatePasswordStrength("NoSpecialChar123").valid, false);
  assert.strictEqual(validatePasswordStrength("SecurePass123!").valid, true);
});

// Test 2: Spreadsheet Formula Injection Sanitization
test("Security: Spreadsheet formula injection protection neutralizes dangerous triggers", () => {
  assert.strictEqual(sanitizeSpreadsheetCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.strictEqual(sanitizeSpreadsheetCell("+12345"), "'+12345");
  assert.strictEqual(sanitizeSpreadsheetCell("-500"), "'-500");
  assert.strictEqual(sanitizeSpreadsheetCell("@SUM(A1:A10)"), "'@SUM(A1:A10)");
  assert.strictEqual(sanitizeSpreadsheetCell("Safe Plain Text"), "Safe Plain Text");
  assert.strictEqual(sanitizeSpreadsheetCell(4520), 4520);
});

// Test 3: Rate Limiter Sliding Window
test("Security: Sliding window rate limiter enforces limits accurately", () => {
  const testId = "test_ip_" + Date.now();
  const options = { limit: 3, windowMs: 10000 };

  const r1 = checkRateLimit(testId, options);
  assert.strictEqual(r1.allowed, true);
  assert.strictEqual(r1.remaining, 2);

  const r2 = checkRateLimit(testId, options);
  assert.strictEqual(r2.allowed, true);
  assert.strictEqual(r2.remaining, 1);

  const r3 = checkRateLimit(testId, options);
  assert.strictEqual(r3.allowed, true);
  assert.strictEqual(r3.remaining, 0);

  const r4 = checkRateLimit(testId, options);
  assert.strictEqual(r4.allowed, false);
});

// Test 4: Data Profiler & Quality Scoring
test("Data Hub: Profiler detects data types and computes quality score", () => {
  const sampleRows = [
    { Date: "2026-01-01", Revenue: 1000, Units: 10, Region: "North" },
    { Date: "2026-01-02", Revenue: 1200, Units: 12, Region: "South" },
    { Date: "2026-01-03", Revenue: 1100, Units: 11, Region: "North" },
    { Date: "2026-01-04", Revenue: 1500, Units: 15, Region: "East" },
  ];

  const profile = profileDataset(sampleRows);
  assert.strictEqual(profile.rowCount, 4);
  assert.strictEqual(profile.columnCount, 4);
  assert.strictEqual(profile.qualityScore >= 80, true);

  const revCol = profile.columns.find((c) => c.name === "Revenue");
  assert.ok(revCol);
  assert.strictEqual(revCol.dataType, "NUMERIC");
  assert.strictEqual(revCol.inferredBusinessRole, "REVENUE");
  assert.strictEqual(revCol.summaryStats.min, 1000);
  assert.strictEqual(revCol.summaryStats.max, 1500);
});

// Test 5: Forecasting Engine (No Data Leakage, Backtesting, Prediction Intervals)
test("ML Forecasting: Multi-model evaluation and walk-forward prediction bounds", () => {
  const monthlyData = [
    { date: "2025-01-01", value: 100 },
    { date: "2025-02-01", value: 110 },
    { date: "2025-03-01", value: 125 },
    { date: "2025-04-01", value: 130 },
    { date: "2025-05-01", value: 145 },
    { date: "2025-06-01", value: 160 },
    { date: "2025-07-01", value: 175 },
    { date: "2025-08-01", value: 190 },
  ];

  const result = generateForecast(monthlyData, 3, 0.95);
  assert.ok(result.championModel);
  assert.strictEqual(result.candidateScores.length, 4);
  assert.strictEqual(typeof result.evaluationMetrics.sMape, "number");
  assert.strictEqual(typeof result.evaluationMetrics.rmse, "number");

  const futureProjections = result.predictions.filter((p) => p.isForecast);
  assert.strictEqual(futureProjections.length, 3);
  for (const proj of futureProjections) {
    assert.ok(proj.predictedValue > 0);
    assert.ok(proj.confidenceLower <= proj.predictedValue);
    assert.ok(proj.confidenceUpper >= proj.predictedValue);
  }
});

// Test 6: Anomaly Detection Engine
test("Anomaly Engine: Detects statistical deviations with rolling Z-score & IQR", () => {
  const points = [
    { date: "2026-01-01", value: 100 },
    { date: "2026-01-02", value: 102 },
    { date: "2026-01-03", value: 98 },
    { date: "2026-01-04", value: 105 },
    { date: "2026-01-05", value: 550 }, // Critical spike anomaly
    { date: "2026-01-06", value: 101 },
  ];

  const anomalies = detectAnomalies(points);
  assert.strictEqual(anomalies.length >= 1, true);
  const spike = anomalies.find((a) => a.timestamp === "2026-01-05");
  assert.ok(spike);
  assert.strictEqual(spike.observedValue, 550);
  assert.strictEqual(spike.severity, "CRITICAL");
});

// Test 7: Business Health Score Computation
test("Intelligence: Health score evaluates multi-factor deterministic score", () => {
  const result = computeBusinessHealthScore({
    revenueGrowthMoM: 14.5,
    grossMarginPct: 68.2,
    netRevenueRetention: 93.4,
    forecastMape: 5.2,
    criticalAnomaliesCount: 0,
    orderGrowthMoM: 11.0,
  });

  assert.ok(result.overallScore >= 80 && result.overallScore <= 100);
  assert.strictEqual(result.rationale.length > 0, true);
});


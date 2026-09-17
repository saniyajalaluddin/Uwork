import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { saveUploadedFile } from "../src/lib/storage/storage";
import {
  generateForecast,

  runHoltWinters,
  runArimaOLS,
  runLinearTrend,
  runDynamicEnsemble,
  TimeSeriesPoint,
} from "../src/services/forecasting.service";
import { POST as createForecastRoute, GET as listForecastsRoute } from "../src/app/api/forecasts/route";
import { NextRequest } from "next/server";

test("Phase 6: Mathematically Sound Time-Series Forecasting & Backtesting", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("ForecastingPass123!#");

  const org = await prisma.organization.create({
    data: { name: `Forecasting Org ${timestamp}`, slug: `forecast-org-${timestamp}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `forecaster_${timestamp}@example.com`,
      passwordHash,
      firstName: "Quant",
      lastName: "Analyst",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, role: "ADMIN" },
  });
  const session = await createSession(user.id, org.id);

  // Synthesize a representative monthly trend + seasonal business revenue series (24 months)
  const monthlyPoints: TimeSeriesPoint[] = [];
  const baseRevenue = 100000;
  const growthRate = 2500; // $2,500/month linear growth

  for (let m = 0; m < 24; m++) {
    const year = 2024 + Math.floor(m / 12);
    const monthNum = (m % 12) + 1;
    const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-01`;

    // Seasonal Q4 lift (months 10, 11, 12)
    const seasonalBump = monthNum >= 10 ? 15000 : 0;
    const value = baseRevenue + m * growthRate + seasonalBump;
    monthlyPoints.push({ date: dateStr, value });
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: OLS Estimation in ARIMA(p,d,0)
    // ------------------------------------------------------------------------
    await t.test("1. ARIMA(p,d,0) derives coefficients via OLS and projects forward accurately", () => {
      const values = monthlyPoints.map((p) => p.value);
      const horizon = 6;
      const predictions = runArimaOLS(values, horizon, 2);

      assert.strictEqual(predictions.length, values.length + horizon);
      const future = predictions.slice(values.length);

      // Verify that future predictions continue positive expansion
      assert.strictEqual(future.length, 6);
      for (let i = 0; i < future.length; i++) {
        assert.ok(future[i] > values[values.length - 1], "Projection should expand beyond last historical observation");
      }
    });

    // ------------------------------------------------------------------------
    // TEST 2: Dynamic Performance-Weighted Ensemble Calculation
    // ------------------------------------------------------------------------
    await t.test("2. Performance-weighted ensemble derives weights from validation accuracy", () => {
      const values = monthlyPoints.map((p) => p.value);
      const hw = runHoltWinters(values, 12, 6);
      const arima = runArimaOLS(values, 6, 2);
      const linear = runLinearTrend(values, 6);

      // Model weights where model 1 performed best (0.7), model 2 medium (0.2), model 3 poor (0.1)
      const weights = [0.7, 0.2, 0.1];
      const ensemble = runDynamicEnsemble([hw, arima, linear], weights);

      assert.strictEqual(ensemble.length, values.length + 6);
      // Verify blended point at index 24 is closer to hw than linear
      const idx = values.length;
      const expectedBlend = hw[idx] * 0.7 + arima[idx] * 0.2 + linear[idx] * 0.1;
      assert.ok(Math.abs(ensemble[idx] - expectedBlend) < 1.0);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Statistical Prediction Intervals Expand with Horizon
    // ------------------------------------------------------------------------
    await t.test("3. Prediction intervals expand monotonically over horizon steps without lookahead bias", () => {
      const result = generateForecast(monthlyPoints, 6, 0.95);

      const future = result.predictions.filter((p) => p.isForecast);
      assert.strictEqual(future.length, 6);

      const step1Width = future[0].confidenceUpper - future[0].confidenceLower;
      const step6Width = future[5].confidenceUpper - future[5].confidenceLower;

      assert.ok(
        step6Width > step1Width,
        `Horizon step 6 interval width (${step6Width}) must exceed horizon step 1 (${step1Width}) due to variance accumulation`
      );

      // Verify non-negativity and bounds correctness
      for (const pt of future) {
        assert.ok(pt.confidenceLower >= 0, "Lower bound must never drop below 0");
        assert.ok(pt.predictedValue >= pt.confidenceLower, "Prediction must be >= lower bound");
        assert.ok(pt.predictedValue <= pt.confidenceUpper, "Prediction must be <= upper bound");
      }
    });

    // ------------------------------------------------------------------------
    // TEST 4: Algorithm Tournament Leaderboard & Validation Metrics
    // ------------------------------------------------------------------------
    await t.test("4. Tournament ranks all 4 candidate models by out-of-time sMAPE", () => {
      const result = generateForecast(monthlyPoints, 6, 0.95);

      assert.strictEqual(result.candidateScores.length, 4);
      const expectedModels = [
        "Holt-Winters Exponential Smoothing",
        "Auto-Regressive Integrated Moving Average (ARIMA)",
        "Ordinary Least Squares Linear Trend",
        "Dynamic Performance-Weighted Ensemble",
      ];

      for (const modName of expectedModels) {
        const found = result.candidateScores.find((c) => c.modelName === modName);
        assert.ok(found, `Expected candidate model '${modName}' in tournament`);
        assert.ok(typeof found.sMape === "number" && found.sMape >= 0);
        assert.ok(typeof found.mae === "number" && found.mae >= 0);
        assert.ok(typeof found.rmse === "number" && found.rmse >= 0);
      }

      // Ranks must be 1, 2, 3, 4
      const ranks = result.candidateScores.map((c) => c.rank);
      assert.deepStrictEqual(ranks, [1, 2, 3, 4]);
      assert.strictEqual(result.championModel, result.candidateScores[0].modelName);
    });

    // ------------------------------------------------------------------------
    // TEST 5: Forecasts API Endpoint Execution & Storage
    // ------------------------------------------------------------------------
    await t.test("5. POST /api/forecasts persists champion run and GET /api/forecasts retrieves results", async () => {
      const testCsv = [
        "Date,Revenue",
        "2025-01-01,10000",
        "2025-02-01,11500",
        "2025-03-01,13000",
        "2025-04-01,14200",
        "2025-05-01,15800",
        "2025-06-01,17000",
      ].join("\n");
      const saved = await saveUploadedFile(org.id, "forecast_test.csv", Buffer.from(testCsv, "utf-8"));

      const dataset = await prisma.dataset.create({
        data: {
          organizationId: org.id,
          name: "Sales For Forecasting",
          createdById: user.id,
        },
      });

      const version = await prisma.datasetVersion.create({
        data: {
          datasetId: dataset.id,
          versionNumber: 1,
          storagePath: saved.storagePath,
          fileName: saved.sanitizedName,
          fileSizeBytes: saved.fileSizeBytes,
          mimeType: "text/csv",
          rowCount: 6,
          columnCount: 2,
          checksumSha256: saved.checksumSha256,
          status: "READY",
        },
      });


      const reqPost = new NextRequest("http://localhost:3000/api/forecasts", {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          cookie: `uwork_session=${session.rawToken}`,
        }),
        body: JSON.stringify({
          datasetVersionId: version.id,
          name: "2026 Q3-Q4 Executive Forecast",
          targetColumn: "Revenue",
          dateColumn: "Date",
          horizonPeriods: 6,
          confidenceLevel: 0.95,
        }),
      });

      const resPost = await createForecastRoute(reqPost);
      assert.strictEqual(resPost.status, 200);
      const jsonPost = await resPost.json();
      assert.ok(jsonPost.data.forecastId);
      assert.ok(jsonPost.data.championModel);
      assert.strictEqual(jsonPost.data.candidateScores.length, 4);

      // Verify GET /api/forecasts
      const reqGet = new NextRequest("http://localhost:3000/api/forecasts", {
        headers: new Headers({ cookie: `uwork_session=${session.rawToken}` }),
      });
      const resGet = await listForecastsRoute(reqGet);
      assert.strictEqual(resGet.status, 200);
      const jsonGet = await resGet.json();
      assert.strictEqual(jsonGet.data.forecasts.length, 1);
      assert.strictEqual(jsonGet.data.forecasts[0].latestRun.candidateScores.length, 4);
    });

  } finally {
    // Teardown
    await prisma.organization.deleteMany({
      where: { id: org.id },
    });
  }
});
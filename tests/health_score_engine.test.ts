import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import {
  computeBusinessHealthScore,
  SECTOR_BENCHMARKS,
  IndustrySector,
} from "../src/services/health-score.service";
import { GET as getHealthScoreRoute, POST as postHealthScoreRoute } from "../src/app/api/health-score/route";
import { NextRequest } from "next/server";

test("Phase 8: Customizable Multi-Dimensional Business Health Score & Sector Benchmarking", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("HealthScorePass123!#");

  // Setup Tenant A (E-Commerce Retailer)
  const orgA = await prisma.organization.create({
    data: { name: `Retail Tenant ${timestamp}`, slug: `retail-tenant-${timestamp}` },
  });
  const userA = await prisma.user.create({
    data: {
      email: `ecommerce_cfo_${timestamp}@example.com`,
      passwordHash,
      firstName: "Retail",
      lastName: "CFO",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: userA.id, role: "ADMIN" },
  });
  const sessionA = await createSession(userA.id, orgA.id);

  // Setup Tenant B (B2B SaaS Provider)
  const orgB = await prisma.organization.create({
    data: { name: `SaaS Tenant ${timestamp}`, slug: `saas-tenant-${timestamp}` },
  });
  const userB = await prisma.user.create({
    data: {
      email: `saas_founder_${timestamp}@example.com`,
      passwordHash,
      firstName: "SaaS",
      lastName: "Founder",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
  });
  const sessionB = await createSession(userB.id, orgB.id);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Sector Benchmark Calibration vs Hardcoded SaaS Margins
    // ------------------------------------------------------------------------
    await t.test("1. E-Commerce margin (38%) is recognized as healthy under ECOMMERCE benchmark but penalized under B2B_SAAS", () => {
      const ecomMetrics = {
        revenueGrowthMoM: 4.8,
        grossMarginPct: 38.0, // High for E-commerce, but low for B2B SaaS
        netRevenueRetention: 72.0, // Healthy repeat rate for D2C
        forecastMape: 11.2,
        criticalAnomaliesCount: 0,
        orderGrowthMoM: 4.5,
      };

      // Score under default B2B SaaS benchmark (target margin 75%, min 45%)
      const saasEvaluation = computeBusinessHealthScore(ecomMetrics, { sector: "B2B_SAAS" });

      // Score under E-Commerce benchmark (target margin 40%, min 18%)
      const ecomEvaluation = computeBusinessHealthScore(ecomMetrics, { sector: "ECOMMERCE" });

      // Under B2B SaaS, 38% is below min margin (45%), penalizing profit score heavily
      assert.ok(
        saasEvaluation.profitScore < 40,
        `Under B2B SaaS benchmark, 38% margin should receive < 40 (got ${saasEvaluation.profitScore})`
      );

      // Under E-Commerce benchmark, 38% margin is near the 40% target, scoring high (> 75)
      assert.ok(
        ecomEvaluation.profitScore >= 75,
        `Under E-Commerce benchmark, 38% margin should score >= 75 (got ${ecomEvaluation.profitScore})`
      );

      // Overall health under E-Commerce reflects genuine operational viability
      assert.ok(
        ecomEvaluation.overallScore > saasEvaluation.overallScore + 15,
        `E-Commerce overall score (${ecomEvaluation.overallScore}) should significantly exceed SaaS-penalized score (${saasEvaluation.overallScore})`
      );

      // Rationale specifies sector context
      assert.ok(ecomEvaluation.rationale[0].includes("E-Commerce"));
    });

    // ------------------------------------------------------------------------
    // TEST 2: Manufacturing Predictability & Sector-Specific Weight Distributions
    // ------------------------------------------------------------------------
    await t.test("2. Manufacturing sector prioritizes profit and operational stability", () => {
      const mfgMetrics = {
        revenueGrowthMoM: 2.8, // Healthy for industrial manufacturing
        grossMarginPct: 29.5, // Near 30% sector target
        netRevenueRetention: 92.0,
        forecastMape: 5.1, // Excellent forecasting accuracy
        criticalAnomaliesCount: 0,
        orderGrowthMoM: 2.4,
      };

      const mfgScore = computeBusinessHealthScore(mfgMetrics, { sector: "MANUFACTURING" });

      assert.strictEqual(mfgScore.weights.profit, 0.35, "Manufacturing should weight profit at 35%");
      assert.strictEqual(mfgScore.weights.stability, 0.25, "Manufacturing should weight stability at 25%");
      assert.strictEqual(mfgScore.weights.revenue, 0.15, "Manufacturing should weight revenue growth at 15%");
      assert.ok(mfgScore.overallScore >= 80, `Manufacturing business should achieve healthy score (got ${mfgScore.overallScore})`);
      assert.ok(mfgScore.stabilityScore >= 85, `Low forecast MAPE should produce stability >= 85 (got ${mfgScore.stabilityScore})`);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Custom Weight Normalization & Custom Benchmark Override
    // ------------------------------------------------------------------------
    await t.test("3. Normalizes custom unscaled weights and accepts custom target overrides", () => {
      const metrics = {
        revenueGrowthMoM: 10.0,
        grossMarginPct: 55.0,
        netRevenueRetention: 95.0,
        forecastMape: 8.0,
        criticalAnomaliesCount: 1,
        orderGrowthMoM: 8.0,
      };

      // User supplies unnormalized custom weights summing to 100 instead of 1.0
      const customWeights = {
        revenue: 40,
        profit: 30,
        retention: 10,
        growth: 10,
        stability: 10,
      };

      const customScore = computeBusinessHealthScore(metrics, {
        sector: "CUSTOM",
        customWeights,
        customBenchmark: {
          targetGrossMarginPct: 50,
          targetRevenueGrowthMoM: 8.0,
        },
      });

      // Sum of normalized weights must equal exactly 1.0
      const sumWeights =
        customScore.weights.revenue +
        customScore.weights.profit +
        customScore.weights.retention +
        customScore.weights.growth +
        customScore.weights.stability;
      assert.strictEqual(Math.round(sumWeights * 100) / 100, 1.0);
      assert.strictEqual(customScore.weights.revenue, 0.4);
      assert.strictEqual(customScore.weights.profit, 0.3);

      // Profit score reflects custom target of 50% (55% exceeds target)
      assert.ok(customScore.profitScore >= 85);
    });

    // ------------------------------------------------------------------------
    // TEST 4: Multi-Tenant REST API & IDOR Isolation (GET & POST)
    // ------------------------------------------------------------------------
    await t.test("4. Health score REST API enforces tenant isolation and saves custom sector profiles", async () => {
      // Create a dataset for Org A to link health score
      const datasetA = await prisma.dataset.create({
        data: {
          organizationId: orgA.id,
          name: "Retail Quarterly P&L",
          sourceType: "CSV",
          createdById: userA.id,
        },
      });
      const versionA = await prisma.datasetVersion.create({
        data: {
          datasetId: datasetA.id,
          versionNumber: 1,
          fileName: "retail_pl.csv",
          fileSizeBytes: 1024,
          mimeType: "text/csv",
          checksumSha256: "retail-sha256",
          storagePath: "storage/test/retail.csv",
          status: "READY",
        },
      });

      // Org A configures and persists health score with ECOMMERCE sector
      const postReqA = new NextRequest("http://localhost:3000/api/health-score", {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          cookie: `uwork_session=${sessionA.rawToken}`,
        }),
        body: JSON.stringify({
          sector: "ECOMMERCE",
          datasetVersionId: versionA.id,
          metricsOverride: {
            revenueGrowthMoM: 6.2,
            grossMarginPct: 39.5,
            netRevenueRetention: 74.0,
            forecastMape: 12.0,
            criticalAnomaliesCount: 0,
            orderGrowthMoM: 5.8,
          },
        }),
      });

      const postResA = await postHealthScoreRoute(postReqA);
      assert.strictEqual(postResA.status, 200);
      const postDataA = await postResA.json();
      assert.strictEqual(postDataA.success, true);
      assert.strictEqual(postDataA.data.healthScore.sector, "ECOMMERCE");
      assert.ok(postDataA.data.healthScore.profitScore >= 75);

      // Org A fetches their health score via GET
      const getReqA = new NextRequest("http://localhost:3000/api/health-score", {
        headers: new Headers({ cookie: `uwork_session=${sessionA.rawToken}` }),
      });
      const getResA = await getHealthScoreRoute(getReqA);
      assert.strictEqual(getResA.status, 200);
      const getDataA = await getResA.json();
      assert.strictEqual(getDataA.data.healthScore.sector, "ECOMMERCE");
      assert.strictEqual(getDataA.data.healthScore.id, postDataA.data.healthScore.id);

      // Org B (Adversary/different tenant) fetches GET /api/health-score
      // Must NOT see Org A's E-Commerce health score or record ID!
      const getReqB = new NextRequest("http://localhost:3000/api/health-score", {
        headers: new Headers({ cookie: `uwork_session=${sessionB.rawToken}` }),
      });
      const getResB = await getHealthScoreRoute(getReqB);
      assert.strictEqual(getResB.status, 200);
      const getDataB = await getResB.json();
      // Org B has no persisted record, so it receives dynamic default B2B_SAAS evaluation
      assert.notStrictEqual(getDataB.data.healthScore.id, postDataA.data.healthScore.id);
      assert.strictEqual(getDataB.data.healthScore.sector, "B2B_SAAS");
    });
  } finally {
    // Cleanup
    await prisma.businessHealthScore.deleteMany({
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


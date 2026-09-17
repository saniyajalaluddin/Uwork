import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import {
  computeBusinessHealthScore,
  SECTOR_BENCHMARKS,
  IndustrySector,
  HealthScoreWeights,
  SectorBenchmark,
} from "@/services/health-score.service";
import { getOverviewData } from "@/services/analytics.service";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const existing = await prisma.businessHealthScore.findFirst({
      where: { organizationId: orgId },
      orderBy: { calculatedAt: "desc" },
    });

    if (existing) {
      let weights = SECTOR_BENCHMARKS.B2B_SAAS.defaultWeights;
      let rationale: string[] = [];
      let sector: IndustrySector = "B2B_SAAS";

      try {
        const parsedWeights = JSON.parse(existing.weightsJson || "{}");
        if (parsedWeights.weights) {
          weights = parsedWeights.weights;
          sector = parsedWeights.sector || "B2B_SAAS";
        } else {
          weights = parsedWeights;
        }
      } catch {}

      try {
        rationale = JSON.parse(existing.rationaleJson || "[]");
      } catch {}

      return successResponse({
        healthScore: {
          id: existing.id,
          overallScore: existing.overallScore,
          revenueScore: existing.revenueScore,
          profitScore: existing.profitScore,
          retentionScore: existing.retentionScore,
          growthScore: existing.growthScore,
          stabilityScore: existing.stabilityScore,
          sector,
          weights,
          rationale,
          calculatedAt: existing.calculatedAt,
        },
        benchmark: SECTOR_BENCHMARKS[sector] || SECTOR_BENCHMARKS.B2B_SAAS,
        availableSectors: Object.keys(SECTOR_BENCHMARKS),
      });
    }

    // If no record exists, compute dynamic score from current tenant metrics
    const overview = await getOverviewData(orgId);
    const dynamicScore = computeBusinessHealthScore({
      revenueGrowthMoM: overview.kpis.revenueGrowthMoM,
      grossMarginPct: overview.kpis.grossMarginPct,
      netRevenueRetention: 94.0,
      forecastMape: 6.0,
      criticalAnomaliesCount: (overview.recentAnomalies || []).filter((a: any) => a.severity === "CRITICAL").length,
      orderGrowthMoM: overview.kpis.revenueGrowthMoM * 0.8,
    });

    return successResponse({
      healthScore: dynamicScore,
      benchmark: SECTOR_BENCHMARKS[dynamicScore.sector],
      availableSectors: Object.keys(SECTOR_BENCHMARKS),
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to retrieve business health score.", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const {
      sector = "B2B_SAAS",
      customBenchmark,
      customWeights,
      datasetVersionId,
      metricsOverride,
    } = body;

    let targetVersionId = datasetVersionId;
    if (!targetVersionId) {
      const latest = await prisma.datasetVersion.findFirst({
        where: { dataset: { organizationId: orgId } },
        orderBy: { createdAt: "desc" },
      });
      targetVersionId = latest?.id;
    }

    // Resolve tenant metrics
    const overview = await getOverviewData(orgId);
    const metrics = metricsOverride || {
      revenueGrowthMoM: overview.kpis.revenueGrowthMoM,
      grossMarginPct: overview.kpis.grossMarginPct,
      netRevenueRetention: 94.0,
      forecastMape: 6.0,
      criticalAnomaliesCount: (overview.recentAnomalies || []).filter((a: any) => a.severity === "CRITICAL").length,
      orderGrowthMoM: overview.kpis.revenueGrowthMoM * 0.85,
    };

    const score = computeBusinessHealthScore(metrics, {
      sector: sector as IndustrySector,
      customBenchmark,
      customWeights,
    });

    let savedRecord = null;
    if (targetVersionId) {
      // Validate dataset version belongs to tenant
      const version = await prisma.datasetVersion.findFirst({
        where: { id: targetVersionId, dataset: { organizationId: orgId } },
      });

      if (version) {
        savedRecord = await prisma.businessHealthScore.create({
          data: {
            organizationId: orgId,
            datasetVersionId: targetVersionId,
            overallScore: score.overallScore,
            revenueScore: score.revenueScore,
            profitScore: score.profitScore,
            retentionScore: score.retentionScore,
            growthScore: score.growthScore,
            stabilityScore: score.stabilityScore,
            weightsJson: JSON.stringify({ sector: score.sector, weights: score.weights }),
            rationaleJson: JSON.stringify(score.rationale),
          },
        });
      }
    }

    return successResponse({
      healthScore: savedRecord
        ? {
            id: savedRecord.id,
            overallScore: savedRecord.overallScore,
            revenueScore: savedRecord.revenueScore,
            profitScore: savedRecord.profitScore,
            retentionScore: savedRecord.retentionScore,
            growthScore: savedRecord.growthScore,
            stabilityScore: savedRecord.stabilityScore,
            sector: score.sector,
            weights: score.weights,
            rationale: score.rationale,
            calculatedAt: savedRecord.calculatedAt,
          }
        : score,
      benchmark: SECTOR_BENCHMARKS[score.sector] || SECTOR_BENCHMARKS.B2B_SAAS,
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to configure health score.", 500);
  }
}


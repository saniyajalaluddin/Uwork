import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse } from "@/lib/api/response";
import { AppConfig } from "@/config/app.config";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  // Query actual usage
  const [datasetsCount, totalForecasts, totalMembers, storageSum] = await Promise.all([
    prisma.dataset.count({ where: { organizationId: orgId, isArchived: false } }),
    prisma.forecast.count({ where: { organizationId: orgId } }),
    prisma.organizationMember.count({ where: { organizationId: orgId } }),
    prisma.datasetVersion.aggregate({
      where: { dataset: { organizationId: orgId } },
      _sum: { fileSizeBytes: true, rowCount: true },
    }),
  ]);

  const usedBytes = storageSum._sum.fileSizeBytes || 0;
  const usedRows = storageSum._sum.rowCount || 0;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { planTier: true, subscriptionStatus: true },
  });

  const { getPlanQuotas } = await import("@/services/quota.service");
  const quota = getPlanQuotas(org?.planTier);

  const benefits = {
    planTier: quota.planTier,
    planName: quota.planName,
    status: org?.subscriptionStatus || "ACTIVE",
    billingCycle: "Monthly / Annual Subscription",
    quotas: {
      rows: {
        used: usedRows,
        limit: quota.maxRows,
        pct: Math.min(100, Math.round((usedRows / quota.maxRows) * 1000) / 10),
      },
      storage: {
        usedBytes: usedBytes,
        limitBytes: quota.maxStorageBytes,
        formattedUsed: `${(usedBytes / (1024 * 1024)).toFixed(2)} MB`,
        formattedLimit: quota.maxStorageFormatted,
        pct: Math.min(100, Math.round((usedBytes / quota.maxStorageBytes) * 1000) / 10),
      },
      teamSeats: {
        used: totalMembers,
        limit: quota.maxTeamSeats,
        pct: Math.min(100, Math.round((totalMembers / quota.maxTeamSeats) * 1000) / 10),
      },
      forecasts: {
        used: totalForecasts,
        limit: quota.maxForecastsPerMonth,
      },
      computeNodes: {
        allocated: quota.computeNodesAllocated,
        type: "Dedicated High-Throughput Numerical Workers",
      },
      auditRetention: quota.auditRetention,
      sla: quota.slaAvailability,
    },
    featuresIncluded: [
      "Multi-Model Time-Series Tournament (Holt-Winters, ARIMA, Random Forest)",
      "Zero-Data-Leakage Out-of-Time Walk-Forward Backtesting",
      "Spreadsheet Formula Injection Sanitizer (=, +, -, @)",
      "Deterministic Tool-Grounded AI Business Assistant",
      "Automated Business Health Score (5 Weighted Dimensions)",
      "Decision Center with Evidence-Linked Action Recommendations",
      "Rolling Z-Score and IQR Anomaly Engine with Root-Cause Scoring",
      "Continuous Automated PDF/CSV/XLSX Report Scheduling",
      "Role-Based Access Control (Owner, Admin, Analyst, Viewer)",
      "Cryptographic Session Revocation and Brute-Force Lockout Protection",
    ],
  };

  return successResponse({ benefits });
}


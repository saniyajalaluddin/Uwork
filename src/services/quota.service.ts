import { prisma } from "../lib/db/prisma";
import { AppConfig } from "../config/app.config";

export type PlanTierName = "STARTER" | "PRO" | "ENTERPRISE";

export interface PlanLimits {
  planTier: string;
  planName: string;
  priceMonthlyUsd: number;
  stripePriceId: string;
  maxRows: number;
  maxStorageBytes: number;
  maxStorageFormatted: string;
  maxTeamSeats: number;
  maxForecastsPerMonth: number;
  computeNodesAllocated: number;
  slaAvailability: string;
  auditRetention: string;
  features: readonly string[];
}

export class QuotaExceededError extends Error {
  public metric: string;
  public limit: number;
  public current: number;
  public planTier: string;

  constructor(metric: string, limit: number, current: number, planTier: string, customMessage?: string) {
    super(
      customMessage ||
        `Quota Exceeded: Organization on the ${planTier} plan has reached the limit of ${limit.toLocaleString()} for ${metric} (currently at ${current.toLocaleString()}). Upgrade your subscription to continue.`
    );
    this.name = "QuotaExceededError";
    this.metric = metric;
    this.limit = limit;
    this.current = current;
    this.planTier = planTier;
  }
}

/**
 * Normalizes and fetches the plan quotas and limits configuration for a given tier name.
 */
export function getPlanQuotas(planTier?: string | null): PlanLimits {
  const normalized = (planTier || "STARTER").toUpperCase();
  if (normalized === "ENTERPRISE") {
    return AppConfig.quotas.enterprise;
  }
  if (normalized === "PRO" || normalized === "PROFESSIONAL") {
    return AppConfig.quotas.pro;
  }
  return AppConfig.quotas.starter;
}

/**
 * Gathers authentic real-time usage metrics across tenant resources.
 */
export async function getOrganizationUsage(organizationId: string) {
  const currentBillingPeriod = new Date().toISOString().slice(0, 7); // e.g. "2026-09"
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    datasetsCount,
    totalMembers,
    storageSum,
    forecastsThisMonth,
    activeWebhooks,
  ] = await Promise.all([
    prisma.dataset.count({
      where: { organizationId, isArchived: false },
    }),
    prisma.organizationMember.count({
      where: { organizationId },
    }),
    prisma.datasetVersion.aggregate({
      where: { dataset: { organizationId, isArchived: false } },
      _sum: { fileSizeBytes: true, rowCount: true },
    }),
    prisma.forecast.count({
      where: {
        organizationId,
        createdAt: { gte: startOfMonth },
      },
    }),
    prisma.webhookSubscription.count({
      where: { organizationId, isActive: true },
    }),
  ]);

  const usedRows = storageSum._sum.rowCount || 0;
  const usedStorageBytes = storageSum._sum.fileSizeBytes || 0;

  return {
    datasetsCount,
    usedRows,
    usedStorageBytes,
    teamSeats: totalMembers,
    forecastsThisMonth,
    activeWebhooks,
    billingPeriod: currentBillingPeriod,
  };
}

/**
 * Asserts that a proposed operation does not exceed plan quota limits.
 * Throws QuotaExceededError if the limit would be breached.
 */
export async function assertWithinQuota(
  organizationId: string,
  metric: "ROWS" | "STORAGE" | "TEAM_SEATS" | "FORECASTS" | "WEBHOOKS",
  requestedIncrement = 1
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planTier: true, subscriptionStatus: true },
  });

  const planTier = org?.planTier || "STARTER";
  const quotas = getPlanQuotas(planTier);
  const usage = await getOrganizationUsage(organizationId);

  // If subscription is past due or canceled, restrict heavy operations
  if (org?.subscriptionStatus === "PAST_DUE") {
    throw new QuotaExceededError(
      metric,
      0,
      0,
      planTier,
      "Subscription Past Due: Payment failed for this organization. Please resolve pending invoices to resume operations."
    );
  }

  switch (metric) {
    case "ROWS": {
      const projected = usage.usedRows + requestedIncrement;
      if (projected > quotas.maxRows) {
        throw new QuotaExceededError("Rows Ingested", quotas.maxRows, usage.usedRows, planTier);
      }
      break;
    }
    case "STORAGE": {
      const projected = usage.usedStorageBytes + requestedIncrement;
      if (projected > quotas.maxStorageBytes) {
        throw new QuotaExceededError(
          "Storage",
          quotas.maxStorageBytes,
          usage.usedStorageBytes,
          planTier,
          `Storage Quota Exceeded: ${quotas.maxStorageFormatted} maximum capacity reached for ${planTier} tier.`
        );
      }
      break;
    }
    case "TEAM_SEATS": {
      const projected = usage.teamSeats + requestedIncrement;
      if (projected > quotas.maxTeamSeats) {
        throw new QuotaExceededError("Team Seats", quotas.maxTeamSeats, usage.teamSeats, planTier);
      }
      break;
    }
    case "FORECASTS": {
      const projected = usage.forecastsThisMonth + requestedIncrement;
      if (projected > quotas.maxForecastsPerMonth) {
        throw new QuotaExceededError(
          "Monthly Forecasts",
          quotas.maxForecastsPerMonth,
          usage.forecastsThisMonth,
          planTier
        );
      }
      break;
    }
    case "WEBHOOKS": {
      // Free tier gets 0 webhooks, Pro gets 5, Enterprise gets 50
      const maxWebhooks = planTier === "ENTERPRISE" ? 50 : planTier === "PRO" ? 5 : 0;
      const projected = usage.activeWebhooks + requestedIncrement;
      if (projected > maxWebhooks) {
        throw new QuotaExceededError(
          "Webhook Endpoints",
          maxWebhooks,
          usage.activeWebhooks,
          planTier,
          `Webhook integrations are not available or exceeded on the ${planTier} plan. Upgrade to expand endpoints.`
        );
      }
      break;
    }
  }

  return { allowed: true, usage, quotas };
}

/**
 * Verifies whether a specific capability is included in the tenant's tier.
 */
export async function assertFeatureEnabled(organizationId: string, featureKey: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planTier: true },
  });

  const quotas = getPlanQuotas(org?.planTier);
  const isEnabled = quotas.features.includes(featureKey);

  if (!isEnabled) {
    throw new Error(
      `Feature '${featureKey}' is restricted to higher tiers and not available on the ${quotas.planName}.`
    );
  }

  return true;
}

/**
 * Records a discrete consumption record for metered billing audits.
 */
export async function recordMeteredUsage(
  organizationId: string,
  metricKey: string,
  quantity: number
) {
  const billingPeriod = new Date().toISOString().slice(0, 7);
  return prisma.meteredUsageRecord.create({
    data: {
      organizationId,
      metricKey,
      quantity,
      billingPeriod,
    },
  });
}


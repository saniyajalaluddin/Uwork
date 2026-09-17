import { prisma } from "../lib/db/prisma";
import { logAuditEvent } from "./audit.service";
import { eventBus } from "../lib/events/event-bus";

export type DecisionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type DecisionCategory = "REVENUE" | "INVENTORY" | "CUSTOMER" | "PRICING" | "REGIONAL" | "OPERATIONS";
export type DecisionStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";

export const SLA_HOURS: Record<DecisionPriority, number> = {
  CRITICAL: 24,
  HIGH: 72,
  MEDIUM: 168, // 7 days
  LOW: 336,    // 14 days
};

export interface DecisionSLAInfo {
  targetHours: number;
  elapsedHours: number;
  remainingHours: number;
  isOverdue: boolean;
  slaDeadline: string;
}

export function computeDecisionSLA(item: {
  priority: string;
  createdAt: Date | string;
  status: string;
}): DecisionSLAInfo {
  const priority = (item.priority as DecisionPriority) || "MEDIUM";
  const targetHours = SLA_HOURS[priority] || 72;
  const createdTime = new Date(item.createdAt).getTime();
  const now = Date.now();
  const elapsedHours = (now - createdTime) / (1000 * 60 * 60);
  const remainingHours = Math.round((targetHours - elapsedHours) * 10) / 10;
  const isTerminal = item.status === "RESOLVED" || item.status === "DISMISSED";
  const isOverdue = !isTerminal && remainingHours < 0;

  return {
    targetHours,
    elapsedHours: Math.round(elapsedHours * 10) / 10,
    remainingHours: isTerminal ? 0 : remainingHours,
    isOverdue,
    slaDeadline: new Date(createdTime + targetHours * 60 * 60 * 1000).toISOString(),
  };
}

const VALID_TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "RESOLVED", "DISMISSED"],
  ACKNOWLEDGED: ["RESOLVED", "DISMISSED", "OPEN"],
  RESOLVED: ["OPEN", "ACKNOWLEDGED"],
  DISMISSED: ["OPEN"],
};

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as DecisionStatus];
  return allowed ? allowed.includes(to as DecisionStatus) : false;
}

export async function listDecisionItems(
  organizationId: string,
  filter?: { status?: string; priority?: string; category?: string }
) {
  const where: any = { organizationId };
  if (filter?.status && filter.status !== "ALL") where.status = filter.status;
  if (filter?.priority && filter.priority !== "ALL") where.priority = filter.priority;
  if (filter?.category && filter.category !== "ALL") where.category = filter.category;

  const items = await prisma.decisionItem.findMany({
    where,
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return items.map((item) => {
    let evidence: any = {};
    try {
      evidence = JSON.parse(item.evidenceJson || "{}");
    } catch {}

    const sla = computeDecisionSLA(item);

    return {
      ...item,
      evidence,
      sla,
    };
  });
}

export async function getDecisionItem(organizationId: string, id: string) {
  const item = await prisma.decisionItem.findFirst({
    where: { id, organizationId },
  });

  if (!item) return null;

  let evidence: any = {};
  try {
    evidence = JSON.parse(item.evidenceJson || "{}");
  } catch {}

  const sla = computeDecisionSLA(item);
  return {
    ...item,
    evidence,
    sla,
  };
}

export async function createDecisionItem(
  organizationId: string,
  data: {
    title: string;
    priority?: DecisionPriority;
    category?: DecisionCategory;
    impactSummary: string;
    recommendedAction: string;
    evidence?: Record<string, any>;
    createdByUserId?: string;
  }
) {
  const item = await prisma.decisionItem.create({
    data: {
      organizationId,
      title: data.title,
      priority: data.priority || "MEDIUM",
      category: data.category || "OPERATIONS",
      impactSummary: data.impactSummary,
      recommendedAction: data.recommendedAction,
      evidenceJson: JSON.stringify(data.evidence || {}),
      status: "OPEN",
    },
  });

  if (data.createdByUserId) {
    await logAuditEvent({
      organizationId,
      userId: data.createdByUserId,
      action: "DECISION_CREATED",
      resourceType: "DECISION_ITEM",
      resourceId: item.id,
      metadata: { title: item.title, priority: item.priority },
    });
  }

  eventBus.publishToTenant(organizationId, "DECISION_UPDATED", {
    action: "CREATED",
    decisionId: item.id,
    title: item.title,
    priority: item.priority,
    status: item.status,
  });

  return getDecisionItem(organizationId, item.id);
}

export async function updateDecisionStatus(
  organizationId: string,
  id: string,
  data: {
    status: DecisionStatus;
    resolutionNotes?: string;
    userId?: string;
  }
) {
  const existing = await prisma.decisionItem.findFirst({
    where: { id, organizationId },
  });

  if (!existing) return null;

  if (!isValidTransition(existing.status, data.status)) {
    throw new Error(
      `Illegal transition from '${existing.status}' to '${data.status}'. Allowed transitions: ${VALID_TRANSITIONS[
        existing.status as DecisionStatus
      ]?.join(", ")}`
    );
  }

  let evidenceObj: any = {};
  try {
    evidenceObj = JSON.parse(existing.evidenceJson || "{}");
  } catch {}

  if (data.resolutionNotes) {
    evidenceObj.resolutionNotes = data.resolutionNotes;
    evidenceObj.resolvedAt = new Date().toISOString();
    evidenceObj.resolvedBy = data.userId || "system";
  }

  const updated = await prisma.decisionItem.update({
    where: { id },
    data: {
      status: data.status,
      evidenceJson: JSON.stringify(evidenceObj),
    },
  });

  if (data.userId) {
    await logAuditEvent({
      organizationId,
      userId: data.userId,
      action: "DECISION_STATUS_UPDATED",
      resourceType: "DECISION_ITEM",
      resourceId: id,
      metadata: {
        from: existing.status,
        to: data.status,
        resolutionNotes: data.resolutionNotes,
      },
    });
  }

  eventBus.publishToTenant(organizationId, "DECISION_UPDATED", {
    action: "STATUS_CHANGED",
    decisionId: id,
    title: updated.title,
    from: existing.status,
    to: data.status,
  });

  return getDecisionItem(organizationId, id);
}

export async function deleteDecisionItem(organizationId: string, id: string) {
  const existing = await prisma.decisionItem.findFirst({
    where: { id, organizationId },
  });

  if (!existing) return false;

  await prisma.decisionItem.delete({ where: { id } });
  return true;
}

export async function synthesizeDecisionsFromAnalytics(organizationId: string) {
  const existingItems = await prisma.decisionItem.findMany({
    where: { organizationId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { title: true, category: true },
  });
  const existingTitles = new Set(existingItems.map((e) => e.title));

  const newItems: Array<{
    title: string;
    priority: DecisionPriority;
    category: DecisionCategory;
    impactSummary: string;
    recommendedAction: string;
    evidence: Record<string, any>;
  }> = [];

  // 1. Check for Critical/High Unresolved Anomalies
  const criticalAnomaly = await prisma.anomaly.findFirst({
    where: { organizationId, isAcknowledged: false, severity: "CRITICAL" },
    orderBy: { detectedAt: "desc" },
  });

  if (criticalAnomaly) {
    const title = `Investigate Critical Anomaly in ${criticalAnomaly.metricName}`;
    if (!existingTitles.has(title)) {
      newItems.push({
        title,
        priority: "CRITICAL",
        category: "OPERATIONS",
        impactSummary: `Critical divergence of ${criticalAnomaly.deviationPct}% detected in ${criticalAnomaly.metricName}. Observed: ${criticalAnomaly.observedValue}, Expected: ${criticalAnomaly.expectedValue}.`,
        recommendedAction: "Review root cause segments and reconcile underlying transaction batches with the operations team.",
        evidence: {
          anomalyId: criticalAnomaly.id,
          metricName: criticalAnomaly.metricName,
          deviationPct: criticalAnomaly.deviationPct,
          method: criticalAnomaly.detectionMethod,
        },
      });
    }
  }

  // 2. Check Health Score Deficits
  const health = await prisma.businessHealthScore.findFirst({
    where: { organizationId },
    orderBy: { calculatedAt: "desc" },
  });

  if (health) {
    // Profitability issue
    if (health.profitScore < 60) {
      const title = "Restructure Cost Baseline to Recover Profit Margin";
      if (!existingTitles.has(title)) {
        newItems.push({
          title,
          priority: "HIGH",
          category: "PRICING",
          impactSummary: `Profitability index currently at ${health.profitScore}/100, lagging behind industry benchmark expectations.`,
          recommendedAction: "Audit product margins across regional cohorts and adjust tier pricing to eliminate negative-margin deals.",
          evidence: {
            profitScore: health.profitScore,
            overallScore: health.overallScore,
          },
        });
      }
    }

    // Customer retention issue
    if (health.retentionScore < 65) {
      const title = "Deploy Customer Retention Interventions for At-Risk Accounts";
      if (!existingTitles.has(title)) {
        newItems.push({
          title,
          priority: "HIGH",
          category: "CUSTOMER",
          impactSummary: `Cohort retention score stands at ${health.retentionScore}/100, signalling potential contract renewal vulnerabilities.`,
          recommendedAction: "Establish executive check-in cadences and assign dedicated customer success engineers to lagging accounts.",
          evidence: {
            retentionScore: health.retentionScore,
          },
        });
      }
    }
  }

  let createdCount = 0;
  for (const item of newItems) {
    await createDecisionItem(organizationId, item);
    createdCount++;
  }

  return {
    synthesizedCount: createdCount,
    items: newItems,
  };
}

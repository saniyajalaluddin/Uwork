import crypto from "crypto";
import { prisma } from "../lib/db/prisma";
import { logAuditEvent } from "./audit.service";
import { logger } from "../lib/observability/logger";

export interface RetentionPolicyInput {
  auditDays?: number;
  forecastDays?: number;
  jobDays?: number;
}

/**
 * Retrieves the current data retention policies for an organization.
 */
export async function getRetentionPolicies(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      retentionAuditDays: true,
      retentionForecastDays: true,
      retentionJobDays: true,
    },
  });

  if (!org) {
    throw new Error("Organization not found.");
  }

  return {
    retentionAuditDays: org.retentionAuditDays,
    retentionForecastDays: org.retentionForecastDays,
    retentionJobDays: org.retentionJobDays,
  };
}

/**
 * Updates configurable data retention policies with regulatory and platform boundary checks.
 */
export async function updateRetentionPolicies(
  organizationId: string,
  policies: RetentionPolicyInput,
  actorUserId: string
) {
  const { auditDays, forecastDays, jobDays } = policies;

  const updateData: any = {};

  if (auditDays !== undefined) {
    if (auditDays < 30 || auditDays > 2555) {
      throw new Error("Audit log retention must be between 30 days and 2555 days (7 years).");
    }
    updateData.retentionAuditDays = auditDays;
  }

  if (forecastDays !== undefined) {
    if (forecastDays < 7 || forecastDays > 730) {
      throw new Error("Forecast retention must be between 7 days and 730 days (2 years).");
    }
    updateData.retentionForecastDays = forecastDays;
  }

  if (jobDays !== undefined) {
    if (jobDays < 1 || jobDays > 365) {
      throw new Error("Job history retention must be between 1 day and 365 days.");
    }
    updateData.retentionJobDays = jobDays;
  }

  const updatedOrg = await prisma.organization.update({
    where: { id: organizationId },
    data: updateData,
    select: {
      id: true,
      retentionAuditDays: true,
      retentionForecastDays: true,
      retentionJobDays: true,
    },
  });

  await logAuditEvent({
    organizationId,
    userId: actorUserId,
    action: "RETENTION_POLICIES_UPDATED",
    resourceType: "COMPLIANCE",
    resourceId: organizationId,
    metadata: { updatedPolicies: updateData },
  });

  return {
    retentionAuditDays: updatedOrg.retentionAuditDays,
    retentionForecastDays: updatedOrg.retentionForecastDays,
    retentionJobDays: updatedOrg.retentionJobDays,
  };
}

/**
 * Executes batched cleanup of expired records according to tenant retention policies.
 */
export async function executeRetentionCleanup(organizationId?: string) {
  const orgs = organizationId
    ? await prisma.organization.findMany({ where: { id: organizationId } })
    : await prisma.organization.findMany();

  let totalPrunedAudits = 0;
  let totalPrunedForecasts = 0;
  let totalPrunedJobs = 0;

  const now = Date.now();

  for (const org of orgs) {
    const auditCutoff = new Date(now - org.retentionAuditDays * 24 * 60 * 60 * 1000);
    const forecastCutoff = new Date(now - org.retentionForecastDays * 24 * 60 * 60 * 1000);
    const jobCutoff = new Date(now - org.retentionJobDays * 24 * 60 * 60 * 1000);

    // 1. Prune expired audit logs
    const prunedAudits = await prisma.auditLog.deleteMany({
      where: {
        organizationId: org.id,
        timestamp: { lt: auditCutoff },
      },
    });

    // 2. Prune expired forecasts
    const prunedForecasts = await prisma.forecast.deleteMany({
      where: {
        organizationId: org.id,
        createdAt: { lt: forecastCutoff },
      },
    });

    // 3. Prune completed or failed jobs older than retention
    const prunedJobs = await prisma.job.deleteMany({
      where: {
        organizationId: org.id,
        status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
        createdAt: { lt: jobCutoff },
      },
    });

    totalPrunedAudits += prunedAudits.count;
    totalPrunedForecasts += prunedForecasts.count;
    totalPrunedJobs += prunedJobs.count;

    if (prunedAudits.count > 0 || prunedForecasts.count > 0 || prunedJobs.count > 0) {
      await logAuditEvent({
        organizationId: org.id,
        action: "RETENTION_CLEANUP_EXECUTED",
        resourceType: "COMPLIANCE",
        resourceId: org.id,
        metadata: {
          prunedAudits: prunedAudits.count,
          prunedForecasts: prunedForecasts.count,
          prunedJobs: prunedJobs.count,
        },
      });
    }
  }

  logger.info(
    `Data retention cleanup complete: ${totalPrunedAudits} audits, ${totalPrunedForecasts} forecasts, ${totalPrunedJobs} jobs pruned.`
  );

  return {
    prunedAuditLogs: totalPrunedAudits,
    prunedForecasts: totalPrunedForecasts,
    prunedJobs: totalPrunedJobs,
    executedAt: new Date().toISOString(),
  };
}

/**
 * GDPR Right to Be Forgotten: Anonymizes personal data and purges credentials for a user.
 * Enforces sole-owner protections before executing erasure.
 */
export async function anonymizeUserAccount(userId: string, actorUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              members: {
                where: { role: "OWNER" },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error("User account not found.");
  }

  // Sole-Owner Protection: User cannot be deleted if they are the sole owner of any organization
  for (const m of user.memberships) {
    if (m.role === "OWNER") {
      const ownerCount = m.organization.members.length;
      if (ownerCount <= 1) {
        throw new Error(
          `Cannot delete account: You are the sole Owner of organization '${m.organization.name}'. Please transfer ownership or delete the organization first.`
        );
      }
    }
  }

  const anonymizedRandom = crypto.randomBytes(8).toString("hex");
  const anonymizedEmail = `anonymized_${anonymizedRandom}@deleted.uwork.internal`;
  const timestamp = new Date();

  // 1. Revoke all active sessions and security tokens
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.organizationMember.deleteMany({ where: { userId } }),
    prisma.organizationInvitation.deleteMany({ where: { invitedById: userId } }),
  ]);

  // 2. Anonymize user profile & zero credentials
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      email: anonymizedEmail,
      firstName: "Anonymized",
      lastName: "User",
      passwordHash: "ANONYMIZED_GDPR_DELETED",
      avatarUrl: null,
      isActive: false,
      deletedAt: timestamp,
      anonymizedAt: timestamp,
    },
  });

  // 3. Log tamper-evident compliance audit trail
  const primaryOrgId = user.memberships[0]?.organizationId;
  if (primaryOrgId) {
    await logAuditEvent({
      organizationId: primaryOrgId,
      userId: actorUserId,
      action: "GDPR_USER_ANONYMIZED",
      resourceType: "USER",
      resourceId: userId,
      metadata: {
        originalUserMask: user.email.slice(0, 3) + "***",
        anonymizedEmail,
      },
    });
  }

  logger.info(`User ${userId} successfully anonymized under GDPR Art. 17`);

  return {
    success: true,
    userId: updatedUser.id,
    anonymizedEmail: updatedUser.email,
    anonymizedAt: timestamp,
  };
}

/**
 * GDPR Art. 20 Data Portability: Assembles a complete, sanitized machine-readable JSON archive
 * of all tenant data assets, scrubbing all authentication secrets and passwords.
 */
export async function createTenantDataExport(organizationId: string, requestedById: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              createdAt: true,
            },
          },
        },
      },
      datasets: {
        where: { isArchived: false },
        include: {
          versions: {
            select: {
              id: true,
              versionNumber: true,
              rowCount: true,
              columnCount: true,
              fileSizeBytes: true,
              status: true,
              createdAt: true,
            },
          },
        },
      },
      forecasts: {
        select: {
          id: true,
          name: true,
          targetColumnName: true,
          frequency: true,
          horizonPeriods: true,
          confidenceLevel: true,
          status: true,
          createdAt: true,
        },
      },
      anomalies: {
        select: {
          id: true,
          severity: true,
          metricName: true,
          detectionMethod: true,
          isAcknowledged: true,
          detectedAt: true,
        },
      },
      decisionItems: {
        select: {
          id: true,
          title: true,
          priority: true,
          status: true,
          category: true,
          impactSummary: true,
          recommendedAction: true,
          createdAt: true,
        },
      },
      reports: {
        select: {
          id: true,
          title: true,
          format: true,
          createdAt: true,
        },
      },
      auditLogs: {
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          timestamp: true,
        },
        take: 500,
        orderBy: { timestamp: "desc" },
      },
    },
  });

  if (!org) {
    throw new Error("Organization not found.");
  }

  // Construct sanitized portability envelope (GDPR Art. 20 compliant)
  const exportPayload = {
    schemaVersion: "1.0",
    exportId: `export_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    generatedAt: new Date().toISOString(),
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      planTier: org.planTier,
      createdAt: org.createdAt,
    },
    members: org.members.map((m) => ({
      userId: m.user.id,
      name: `${m.user.firstName} ${m.user.lastName}`,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    datasets: org.datasets.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      createdAt: d.createdAt,
      versions: d.versions,
    })),
    forecasts: org.forecasts,
    anomalies: org.anomalies,
    decisions: org.decisionItems,
    reports: org.reports,
    auditTrail: org.auditLogs,
  };

  const serialized = JSON.stringify(exportPayload, null, 2);
  const fileSizeBytes = Buffer.byteLength(serialized, "utf8");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 day expiry

  const exportRecord = await prisma.dataExportRequest.create({
    data: {
      organizationId,
      requestedById,
      status: "COMPLETED",
      fileSizeBytes,
      exportDataJson: serialized,
      expiresAt,
      completedAt: new Date(),
    },
  });

  // Update download URL
  const downloadUrl = `/api/compliance/export/${exportRecord.id}`;
  const finalRecord = await prisma.dataExportRequest.update({
    where: { id: exportRecord.id },
    data: { downloadUrl },
  });

  await logAuditEvent({
    organizationId,
    userId: requestedById,
    action: "DATA_EXPORT_GENERATED",
    resourceType: "COMPLIANCE",
    resourceId: exportRecord.id,
    metadata: { fileSizeBytes, exportId: exportRecord.id },
  });

  return {
    id: finalRecord.id,
    organizationId: finalRecord.organizationId,
    status: finalRecord.status,
    fileSizeBytes: finalRecord.fileSizeBytes,
    downloadUrl: finalRecord.downloadUrl,
    expiresAt: finalRecord.expiresAt,
    createdAt: finalRecord.createdAt,
    payload: exportPayload,
  };
}

/**
 * Retrieves a specific data export with tenant boundary isolation.
 */
export async function getTenantDataExport(organizationId: string, exportId: string) {
  const record = await prisma.dataExportRequest.findFirst({
    where: { id: exportId, organizationId },
  });

  if (!record) {
    throw new Error("Export request not found in this organization.");
  }

  if (new Date() > record.expiresAt) {
    throw new Error("This data export has expired and is no longer available.");
  }

  return {
    ...record,
    data: record.exportDataJson ? JSON.parse(record.exportDataJson) : null,
  };
}

/**
 * Lists past data exports for an organization.
 */
export async function listTenantDataExports(organizationId: string) {
  const exports = await prisma.dataExportRequest.findMany({
    where: { organizationId },
    select: {
      id: true,
      status: true,
      fileSizeBytes: true,
      downloadUrl: true,
      expiresAt: true,
      completedAt: true,
      createdAt: true,
      requestedBy: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return exports;
}

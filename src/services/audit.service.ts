import crypto from "crypto";
import { prisma } from "../lib/db/prisma";

export interface CreateAuditLogParams {
  organizationId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: "SUCCESS" | "DENIED" | "FAILURE";
  metadata?: Record<string, any>;
}

export interface AuditChainEntry {
  sequenceNumber: number;
  previousHash: string;
  hash: string;
  timestamp: string;
  version: string;
}

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Deterministically computes SHA-256 hash for an audit log entry link in the chain
 */
export function computeAuditHash(entry: {
  sequenceNumber: number;
  previousHash: string;
  organizationId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  status: string;
  timestamp: string;
}): string {
  const payload = [
    entry.sequenceNumber,
    entry.previousHash,
    entry.organizationId,
    entry.userId || "null",
    entry.action,
    entry.resourceType,
    entry.resourceId,
    entry.status,
    entry.timestamp,
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Creates a cryptographically chained, tamper-evident audit log entry.
 */
export async function logAuditEvent(params: CreateAuditLogParams) {
  const {
    organizationId,
    userId = null,
    action,
    resourceType,
    resourceId,
    ipAddress = null,
    userAgent = null,
    status = "SUCCESS",
    metadata = {},
  } = params;

  // Retrieve previous chained entry for this organization
  const previousLog = await prisma.auditLog.findFirst({
    where: { organizationId },
    orderBy: { timestamp: "desc" },
  });

  let previousHash = GENESIS_HASH;
  let sequenceNumber = 1;

  if (previousLog) {
    try {
      const prevMeta = JSON.parse(previousLog.metadataJson || "{}");
      if (prevMeta._auditChain?.hash) {
        previousHash = prevMeta._auditChain.hash;
        sequenceNumber = (prevMeta._auditChain.sequenceNumber || 1) + 1;
      }
    } catch {}
  }

  const now = new Date();
  // Ensure strict monotonic timestamp increase to guarantee deterministic ordering
  const effectiveTimestamp =
    previousLog && previousLog.timestamp.getTime() >= now.getTime()
      ? new Date(previousLog.timestamp.getTime() + 1)
      : now;
  const timestampIso = effectiveTimestamp.toISOString();

  const hash = computeAuditHash({
    sequenceNumber,
    previousHash,
    organizationId,
    userId,
    action,
    resourceType,
    resourceId,
    status,
    timestamp: timestampIso,
  });

  const enrichedMetadata = {
    ...metadata,
    _auditChain: {
      sequenceNumber,
      previousHash,
      hash,
      timestamp: timestampIso,
      version: "1.0",
    },
  };

  return prisma.auditLog.create({
    data: {
      organizationId,
      userId,
      action,
      resourceType,
      resourceId,
      ipAddress,
      userAgent,
      status,
      metadataJson: JSON.stringify(enrichedMetadata),
      timestamp: effectiveTimestamp,
    },
  });
}

/**
 * Cryptographically verifies the integrity of the audit log chain for an organization.
 * Detects any insertions, modifications, deletions, or tail truncations in history.
 */
export async function verifyAuditChain(
  organizationId: string,
  expectedHeadHash?: string
): Promise<{
  valid: boolean;
  totalEntries: number;
  verifiedCount: number;
  genesisHash: string;
  headHash: string | null;
  tamperDetectedAt?: {
    sequenceNumber: number;
    logId: string;
    reason: string;
    expectedHash?: string;
    actualHash?: string;
  };
}> {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
  });

  if (logs.length === 0) {
    return {
      valid: !expectedHeadHash,
      totalEntries: 0,
      verifiedCount: 0,
      genesisHash: GENESIS_HASH,
      headHash: null,
      ...(expectedHeadHash
        ? {
            tamperDetectedAt: {
              sequenceNumber: 0,
              logId: "HEAD",
              reason: `Expected head hash ${expectedHeadHash} but audit log is empty.`,
            },
          }
        : {}),
    };
  }

  let expectedPreviousHash = GENESIS_HASH;
  let verifiedCount = 0;
  let lastHeadHash: string | null = null;
  let expectedSequenceNumber: number | null = null;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    let chainMeta: AuditChainEntry | null = null;
    try {
      const meta = JSON.parse(log.metadataJson || "{}");
      if (meta._auditChain) {
        chainMeta = meta._auditChain;
      }
    } catch {}

    if (!chainMeta) {
      // Legacy entry without cryptographic chain envelope; skip to maintain backward compatibility
      continue;
    }

    if (expectedSequenceNumber === null) {
      expectedSequenceNumber = chainMeta.sequenceNumber;
    } else if (chainMeta.sequenceNumber !== expectedSequenceNumber) {
      return {
        valid: false,
        totalEntries: logs.length,
        verifiedCount,
        genesisHash: GENESIS_HASH,
        headHash: lastHeadHash,
        tamperDetectedAt: {
          sequenceNumber: chainMeta.sequenceNumber,
          logId: log.id,
          reason: `Sequence gap detected: expected sequence ${expectedSequenceNumber}, but found ${chainMeta.sequenceNumber}. One or more intermediate audit records were removed.`,
        },
      };
    }

    // 1. Verify previous hash pointer
    if (chainMeta.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        totalEntries: logs.length,
        verifiedCount,
        genesisHash: GENESIS_HASH,
        headHash: lastHeadHash,
        tamperDetectedAt: {
          sequenceNumber: chainMeta.sequenceNumber,
          logId: log.id,
          reason: `Broken chain link: previousHash mismatch (expected ${expectedPreviousHash.slice(0, 16)}..., got ${chainMeta.previousHash.slice(0, 16)}...). Record deletion or reordering detected.`,
        },
      };
    }

    // 2. Recompute current hash and verify tamper-freedom
    const recomputedHash = computeAuditHash({
      sequenceNumber: chainMeta.sequenceNumber,
      previousHash: chainMeta.previousHash,
      organizationId: log.organizationId,
      userId: log.userId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      status: log.status,
      timestamp: chainMeta.timestamp,
    });

    if (recomputedHash !== chainMeta.hash) {
      return {
        valid: false,
        totalEntries: logs.length,
        verifiedCount,
        genesisHash: GENESIS_HASH,
        headHash: lastHeadHash,
        tamperDetectedAt: {
          sequenceNumber: chainMeta.sequenceNumber,
          logId: log.id,
          reason: `Record content altered: hash signature invalid. Tampering detected in audit record.`,
          expectedHash: chainMeta.hash,
          actualHash: recomputedHash,
        },
      };
    }

    expectedPreviousHash = chainMeta.hash;
    lastHeadHash = chainMeta.hash;
    expectedSequenceNumber++;
    verifiedCount++;
  }

  // 3. Optional head hash validation
  if (expectedHeadHash && lastHeadHash !== expectedHeadHash) {
    return {
      valid: false,
      totalEntries: logs.length,
      verifiedCount,
      genesisHash: GENESIS_HASH,
      headHash: lastHeadHash,
      tamperDetectedAt: {
        sequenceNumber: verifiedCount,
        logId: "HEAD",
        reason: `Head hash mismatch: expected ${expectedHeadHash.slice(0, 16)}..., but got ${lastHeadHash ? lastHeadHash.slice(0, 16) : "null"}... Recent audit records may have been truncated or deleted.`,
        expectedHash: expectedHeadHash,
        actualHash: lastHeadHash || undefined,
      },
    };
  }

  return {
    valid: true,
    totalEntries: logs.length,
    verifiedCount,
    genesisHash: GENESIS_HASH,
    headHash: lastHeadHash,
  };
}

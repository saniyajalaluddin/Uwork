import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { DatabaseSync } from "node:sqlite";
import { prisma } from "../lib/db/prisma";
import { logAuditEvent } from "./audit.service";
import { logger } from "../lib/observability/logger";

const SQLITE_HEADER = "SQLite format 3\0";
const MAX_BACKUP_RETENTION = 10;

/**
 * Resolves the absolute path to the active SQLite database.
 */
function resolveDatabasePath(): string {
  const primaryPath = path.resolve(process.cwd(), "prisma", "uwork.db");
  if (fsSync.existsSync(primaryPath)) return primaryPath;

  const fallbackPath = path.resolve(process.cwd(), "uwork.db");
  if (fsSync.existsSync(fallbackPath)) return fallbackPath;

  return primaryPath;
}

/**
 * Computes the SHA-256 checksum of a file.
 */
async function computeFileSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const fileStream = fsSync.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    fileStream.on("data", (chunk) => hash.update(chunk));
    fileStream.on("end", () => resolve(hash.digest("hex")));
    fileStream.on("error", (err) => reject(err));
  });
}

/**
 * Verifies the SQLite binary header and runs PRAGMA integrity_check on a snapshot file.
 */
export function runSyntheticIntegrityCheck(filePath: string): { valid: boolean; details: string } {
  if (!fsSync.existsSync(filePath)) {
    return { valid: false, details: "Backup file does not exist on disk." };
  }

  // 1. Verify Magic Header
  const buffer = Buffer.alloc(16);
  const fd = fsSync.openSync(filePath, "r");
  fsSync.readSync(fd, buffer, 0, 16, 0);
  fsSync.closeSync(fd);

  if (buffer.toString("utf8") !== SQLITE_HEADER) {
    return { valid: false, details: "Invalid SQLite magic byte header." };
  }

  // 2. Run PRAGMA integrity_check via read-only engine
  try {
    const db = new DatabaseSync(filePath, { readOnly: true });
    const rows = db.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
    db.close();

    const isOk = rows.length > 0 && rows[0].integrity_check === "ok";
    return {
      valid: isOk,
      details: isOk ? "ok" : JSON.stringify(rows),
    };
  } catch (err: any) {
    return { valid: false, details: `Integrity check failed: ${err.message}` };
  }
}

/**
 * Creates an atomic snapshot backup of the live SQLite database, hashes it, and prunes expired snapshots.
 */
export async function createDatabaseBackup(
  triggeredById?: string,
  backupType: "FULL_SNAPSHOT" | "SCHEDULED_CRON" = "FULL_SNAPSHOT"
) {
  const startTime = performance.now();
  const dbPath = resolveDatabasePath();

  if (!fsSync.existsSync(dbPath)) {
    throw new Error(`Active SQLite database file not found at ${dbPath}`);
  }

  // Flush Write-Ahead Log into main database file before copying
  try {
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    // If WAL is not enabled or fails, proceed with standard atomic copy
  }

  const backupsDir = path.resolve(process.cwd(), "storage", "backups");
  await fs.mkdir(backupsDir, { recursive: true });

  const randomSuffix = crypto.randomBytes(4).toString("hex");
  const fileName = `uwork_backup_${Date.now()}_${randomSuffix}.db`;
  const storagePath = path.join(backupsDir, fileName);

  // Atomic file copy
  await fs.copyFile(dbPath, storagePath);

  // Compute Checksum & File Size
  const checksumSha256 = await computeFileSha256(storagePath);
  const fileStat = await fs.stat(storagePath);
  const fileSizeBytes = fileStat.size;

  // Run immediate synthetic verification
  const verification = runSyntheticIntegrityCheck(storagePath);
  const durationMs = Math.round(performance.now() - startTime);

  const backupRecord = await prisma.systemBackup.create({
    data: {
      fileName,
      storagePath,
      fileSizeBytes,
      checksumSha256,
      status: verification.valid ? "COMPLETED" : "FAILED",
      integrityCheckPassed: verification.valid,
      backupType,
      triggeredById: triggeredById || null,
      durationMs,
      errorMessage: verification.valid ? null : verification.details,
    },
  });

  // Automated Retention: Prune older backups keeping the latest MAX_BACKUP_RETENTION
  await pruneExpiredBackups();

  // Audit event
  if (triggeredById) {
    // Lookup user's active organization for tenant audit logging if available
    const user = await prisma.user.findUnique({
      where: { id: triggeredById },
      include: { memberships: true },
    });
    const orgId = user?.memberships[0]?.organizationId;
    if (orgId) {
      await logAuditEvent({
        organizationId: orgId,
        userId: triggeredById,
        action: "DATABASE_BACKUP_CREATED",
        resourceType: "SYSTEM_BACKUP",
        resourceId: backupRecord.id,
        metadata: {
          fileName,
          fileSizeBytes,
          checksumSha256,
          durationMs,
        },
      });
    }
  }

  logger.info(
    `Database backup completed: ${fileName} (${(fileSizeBytes / 1024).toFixed(1)} KB, SHA-256: ${checksumSha256.slice(
      0,
      12
    )}...) in ${durationMs}ms`
  );

  return backupRecord;
}

/**
 * Manually or synthetically verifies the integrity of an existing backup snapshot.
 */
export async function verifyBackupIntegrity(backupId: string, actorUserId?: string) {
  const record = await prisma.systemBackup.findUnique({
    where: { id: backupId },
  });

  if (!record) {
    throw new Error("Backup record not found.");
  }

  // 1. Verify file exists
  if (!fsSync.existsSync(record.storagePath)) {
    await prisma.systemBackup.update({
      where: { id: backupId },
      data: { status: "FAILED", integrityCheckPassed: false, errorMessage: "File missing on storage" },
    });
    throw new Error("Backup file is missing from storage disk.");
  }

  // 2. Verify SHA-256 checksum matches catalog
  const currentChecksum = await computeFileSha256(record.storagePath);
  if (currentChecksum !== record.checksumSha256) {
    await prisma.systemBackup.update({
      where: { id: backupId },
      data: {
        status: "FAILED",
        integrityCheckPassed: false,
        errorMessage: `Checksum mismatch: expected ${record.checksumSha256}, got ${currentChecksum}`,
      },
    });
    throw new Error("Backup checksum mismatch: file tampering or corruption detected.");
  }

  // 3. Run SQLite PRAGMA integrity_check
  const check = runSyntheticIntegrityCheck(record.storagePath);
  if (!check.valid) {
    await prisma.systemBackup.update({
      where: { id: backupId },
      data: {
        status: "FAILED",
        integrityCheckPassed: false,
        errorMessage: check.details,
      },
    });
    throw new Error(`Database integrity check failed: ${check.details}`);
  }

  // 4. Update status to VERIFIED
  const updated = await prisma.systemBackup.update({
    where: { id: backupId },
    data: {
      status: "VERIFIED",
      integrityCheckPassed: true,
      errorMessage: null,
    },
  });

  if (actorUserId) {
    const user = await prisma.user.findUnique({
      where: { id: actorUserId },
      include: { memberships: true },
    });
    const orgId = user?.memberships[0]?.organizationId;
    if (orgId) {
      await logAuditEvent({
        organizationId: orgId,
        userId: actorUserId,
        action: "DATABASE_BACKUP_VERIFIED",
        resourceType: "SYSTEM_BACKUP",
        resourceId: backupId,
        metadata: {
          fileName: record.fileName,
          checksumSha256: record.checksumSha256,
        },
      });
    }
  }

  return {
    success: true,
    backupId: updated.id,
    fileName: updated.fileName,
    status: updated.status,
    integrityCheckPassed: updated.integrityCheckPassed,
    checksumSha256: updated.checksumSha256,
  };
}

/**
 * Lists all database backup records ordered chronologically descending.
 */
export async function listDatabaseBackups() {
  return prisma.systemBackup.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      triggeredBy: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    take: 50,
  });
}

/**
 * Deletes a backup record and its storage snapshot.
 */
export async function deleteDatabaseBackup(backupId: string) {
  const record = await prisma.systemBackup.findUnique({ where: { id: backupId } });
  if (!record) throw new Error("Backup not found.");

  if (fsSync.existsSync(record.storagePath)) {
    try {
      await fs.unlink(record.storagePath);
    } catch {}
  }

  return prisma.systemBackup.delete({ where: { id: backupId } });
}

/**
 * Automated retention policy: prunes snapshots beyond MAX_BACKUP_RETENTION.
 */
export async function pruneExpiredBackups(maxRetention = MAX_BACKUP_RETENTION) {
  const allBackups = await prisma.systemBackup.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (allBackups.length <= maxRetention) return { prunedCount: 0 };

  const toPrune = allBackups.slice(maxRetention);
  let prunedCount = 0;

  for (const b of toPrune) {
    try {
      if (fsSync.existsSync(b.storagePath)) {
        await fs.unlink(b.storagePath);
      }
      await prisma.systemBackup.delete({ where: { id: b.id } });
      prunedCount++;
    } catch (err: any) {
      logger.warn(`Failed to prune expired backup ${b.id}: ${err.message}`);
    }
  }

  if (prunedCount > 0) {
    logger.info(`Pruned ${prunedCount} expired database backup snapshots`);
  }

  return { prunedCount };
}


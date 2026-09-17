import test from "node:test";
import assert from "node:assert";
import fs from "fs/promises";
import fsSync from "fs";
import crypto from "crypto";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { runCanaryDiagnostics } from "../src/services/health.service";
import {
  createDatabaseBackup,
  verifyBackupIntegrity,
  listDatabaseBackups,
  pruneExpiredBackups,
  runSyntheticIntegrityCheck,
  deleteDatabaseBackup,
} from "../src/services/backup.service";
import { GET as getHealthRoute } from "../src/app/api/health/route";
import { GET as getCanaryRoute } from "../src/app/api/health/canary/route";
import { GET as listBackupsRoute, POST as createBackupRoute } from "../src/app/api/admin/backups/route";
import { POST as verifyBackupRoute } from "../src/app/api/admin/backups/[id]/verify/route";
import { NextRequest } from "next/server";

test("Phase 22: System Health, Canary Diagnostics & Automated Backups", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SystemPass123!#");

  // 1. Setup Tenant Alpha
  const org = await prisma.organization.create({
    data: {
      name: `System Corp ${timestamp}`,
      slug: `system-corp-${timestamp}`,
      planTier: "ENTERPRISE",
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: `sysadmin_${timestamp}@example.com`,
      passwordHash,
      firstName: "Sys",
      lastName: "Admin",
    },
  });

  const analystUser = await prisma.user.create({
    data: {
      email: `sysanalyst_${timestamp}@example.com`,
      passwordHash,
      firstName: "Sys",
      lastName: "Analyst",
    },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: adminUser.id, role: "OWNER" },
      { organizationId: org.id, userId: analystUser.id, role: "ANALYST" },
    ],
  });

  const adminSession = await createSession(adminUser.id, org.id);
  const analystSession = await createSession(analystUser.id, org.id);

  const createMockReq = (
    url: string,
    method = "GET",
    body?: any,
    sessionToken = adminSession.rawToken
  ) => {
    const fullUrl = new URL(url, "http://localhost:3000");
    const headers: Record<string, string> = {
      cookie: `uwork_session=${sessionToken}`,
      "x-request-id": `req_sys_test_${Date.now()}`,
    };
    if (body) headers["content-type"] = "application/json";

    return new NextRequest(fullUrl.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  await t.test("Subtest 1: Canary Probes & Subsystem Latency Diagnostic Engine", async () => {
    const report = await runCanaryDiagnostics();

    assert.ok(["HEALTHY", "DEGRADED"].includes(report.overallStatus));
    assert.strictEqual(report.httpStatusCode, 200);
    assert.ok(report.uptimeSeconds >= 0);
    assert.ok(report.timestamp);

    // Verify Database Probe
    assert.ok(report.probes.database);
    assert.strictEqual(report.probes.database.name, "Database Subsystem");
    assert.ok(["PASS", "WARN"].includes(report.probes.database.status));
    assert.ok(typeof report.probes.database.latencyMs === "number");

    // Verify Storage Probe
    assert.ok(report.probes.storage);
    assert.strictEqual(report.probes.storage.name, "Storage Subsystem");
    assert.strictEqual(report.probes.storage.status, "PASS");
    assert.ok(typeof report.probes.storage.latencyMs === "number");

    // Verify Memory Probe
    assert.ok(report.probes.memory);
    assert.strictEqual(report.probes.memory.name, "Process Memory Subsystem");
    assert.ok(report.probes.memory.details?.rssMb > 0);
    assert.ok(report.probes.memory.details?.heapUsedMb > 0);

    // Verify Event Loop Probe
    assert.ok(report.probes.eventLoop);
    assert.strictEqual(report.probes.eventLoop.name, "Event Loop Subsystem");
    assert.ok(["PASS", "WARN"].includes(report.probes.eventLoop.status));

    // Verify Job Queue Probe
    assert.ok(report.probes.jobQueue);
    assert.strictEqual(report.probes.jobQueue.name, "Job Queue Subsystem");
  });

  await t.test("Subtest 2: Atomic SQLite Backup Snapshot Creation & Checksumming", async () => {
    const backup = await createDatabaseBackup(adminUser.id, "FULL_SNAPSHOT");

    assert.ok(backup.id);
    assert.ok(backup.fileName.startsWith("uwork_backup_"));
    assert.ok(backup.fileName.endsWith(".db"));
    assert.ok(backup.fileSizeBytes > 0);
    assert.strictEqual(backup.checksumSha256.length, 64);
    assert.ok(backup.durationMs >= 0);
    assert.strictEqual(backup.integrityCheckPassed, true);

    // Verify file exists physically on disk
    assert.strictEqual(fsSync.existsSync(backup.storagePath), true);

    // Independently verify SHA-256 hash of backup file
    const fileBytes = await fs.readFile(backup.storagePath);
    const expectedHash = crypto.createHash("sha256").update(fileBytes).digest("hex");
    assert.strictEqual(backup.checksumSha256, expectedHash);

    // Verify audit log was emitted
    const audit = await prisma.auditLog.findFirst({
      where: { action: "DATABASE_BACKUP_CREATED", resourceId: backup.id },
    });
    assert.ok(audit);
  });

  await t.test("Subtest 3: Backup Synthetic Integrity Verification (SQLite Magic Header & PRAGMA)", async () => {
    const backup = await createDatabaseBackup(adminUser.id, "FULL_SNAPSHOT");

    // Direct check function
    const check = runSyntheticIntegrityCheck(backup.storagePath);
    assert.strictEqual(check.valid, true);
    assert.strictEqual(check.details, "ok");

    // Service verify
    const verifyResult = await verifyBackupIntegrity(backup.id, adminUser.id);
    assert.strictEqual(verifyResult.success, true);
    assert.strictEqual(verifyResult.status, "VERIFIED");
    assert.strictEqual(verifyResult.integrityCheckPassed, true);

    // Verify tamper detection on altered file
    const tamperedFileName = `tampered_${Date.now()}.db`;
    const tamperedPath = backup.storagePath.replace(backup.fileName, tamperedFileName);
    await fs.writeFile(tamperedPath, Buffer.from("CORRUPT_NOT_SQLITE"));

    const tamperedRecord = await prisma.systemBackup.create({
      data: {
        fileName: tamperedFileName,
        storagePath: tamperedPath,
        fileSizeBytes: 18,
        checksumSha256: "dummy_checksum_to_fail",
        status: "COMPLETED",
        integrityCheckPassed: false,
      },
    });

    await assert.rejects(
      () => verifyBackupIntegrity(tamperedRecord.id, adminUser.id),
      /checksum mismatch|Integrity check failed/
    );

    // Cleanup tampered test file
    await deleteDatabaseBackup(tamperedRecord.id);
  });

  await t.test("Subtest 4: Backup Retention Policy Pruning", async () => {
    // Create 3 temporary backups
    const b1 = await createDatabaseBackup(adminUser.id);
    const b2 = await createDatabaseBackup(adminUser.id);
    const b3 = await createDatabaseBackup(adminUser.id);

    // Prune to keep only 2
    const pruneRes = await pruneExpiredBackups(2);
    assert.ok(pruneRes.prunedCount >= 1);

    const remaining = await listDatabaseBackups();
    assert.strictEqual(remaining.length, 2);

    // Cleanup remaining
    for (const b of remaining) {
      await deleteDatabaseBackup(b.id);
    }
  });

  await t.test("Subtest 5: REST API Endpoints & RBAC Security", async () => {
    // A. GET /api/health
    const healthRes = await getHealthRoute();
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, "HEALTHY");
    assert.strictEqual(healthData.database, "CONNECTED");
    assert.ok(healthData.canaryDiagnosticsUrl);

    // B. GET /api/health/canary
    const canaryRes = await getCanaryRoute();
    assert.strictEqual(canaryRes.status, 200);
    const canaryData = await canaryRes.json();
    assert.ok(canaryData.probes.database);
    assert.ok(canaryData.probes.storage);

    // C. POST /api/admin/backups (as Admin)
    const createBackupRes = await createBackupRoute(createMockReq("/api/admin/backups", "POST"));
    assert.strictEqual(createBackupRes.status, 201);
    const createData = await createBackupRes.json();
    assert.strictEqual(createData.success, true);
    const newBackupId = createData.data.backup.id;

    // D. GET /api/admin/backups (as Admin)
    const listRes = await listBackupsRoute(createMockReq("/api/admin/backups"));
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.data.backups.some((b: any) => b.id === newBackupId));

    // E. POST /api/admin/backups/[id]/verify (as Admin)
    const verifyRes = await verifyBackupRoute(
      createMockReq(`/api/admin/backups/${newBackupId}/verify`, "POST"),
      { params: Promise.resolve({ id: newBackupId }) }
    );
    assert.strictEqual(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.data.result.status, "VERIFIED");

    // F. POST /api/admin/backups (as Analyst without org:manage -> 403 Forbidden)
    const forbiddenRes = await createBackupRoute(
      createMockReq("/api/admin/backups", "POST", undefined, analystSession.rawToken)
    );
    assert.strictEqual(forbiddenRes.status, 403);
  });
});


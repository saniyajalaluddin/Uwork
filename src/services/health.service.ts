import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/db/prisma";
import { AppConfig } from "../config/app.config";
import { logger } from "../lib/observability/logger";

export type ProbeStatus = "PASS" | "WARN" | "FAIL";
export type OverallSystemStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY";

export interface CanaryProbeResult {
  name: string;
  status: ProbeStatus;
  latencyMs: number;
  message: string;
  details?: Record<string, any>;
}

export interface CanaryDiagnosticsReport {
  overallStatus: OverallSystemStatus;
  httpStatusCode: number;
  timestamp: string;
  service: string;
  version: string;
  uptimeSeconds: number;
  environment: string;
  probes: {
    database: CanaryProbeResult;
    storage: CanaryProbeResult;
    memory: CanaryProbeResult;
    eventLoop: CanaryProbeResult;
    jobQueue: CanaryProbeResult;
  };
}

/**
 * Runs active synthetic canary diagnostics across core infrastructure subsystems.
 */
export async function runCanaryDiagnostics(): Promise<CanaryDiagnosticsReport> {
  const timestamp = new Date().toISOString();
  const uptimeSeconds = Math.floor(process.uptime());

  // 1. Database Connectivity & Query Latency Probe
  let dbProbe: CanaryProbeResult;
  const dbStart = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = performance.now() - dbStart;
    dbProbe = {
      name: "Database Subsystem",
      status: dbLatency > 500 ? "FAIL" : dbLatency > 150 ? "WARN" : "PASS",
      latencyMs: parseFloat(dbLatency.toFixed(2)),
      message:
        dbLatency > 150
          ? `Database responsive but experiencing latency (${dbLatency.toFixed(1)}ms)`
          : "Database operational with optimal response latency",
      details: { driver: "SQLite / Prisma", latencyThresholdMs: 150 },
    };
  } catch (err: any) {
    dbProbe = {
      name: "Database Subsystem",
      status: "FAIL",
      latencyMs: parseFloat((performance.now() - dbStart).toFixed(2)),
      message: `Database query probe failed: ${err.message}`,
    };
  }

  // 2. Storage System Write / Read Roundtrip Probe
  let storageProbe: CanaryProbeResult;
  const storageStart = performance.now();
  const tempFilePath = path.resolve(process.cwd(), "storage", "canary_probe.tmp");
  try {
    const probePayload = `CANARY_PROBE_${Date.now()}_${Math.random()}`;
    await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
    await fs.writeFile(tempFilePath, probePayload, "utf8");
    const readPayload = await fs.readFile(tempFilePath, "utf8");
    await fs.unlink(tempFilePath);

    const storageLatency = performance.now() - storageStart;
    if (readPayload !== probePayload) {
      storageProbe = {
        name: "Storage Subsystem",
        status: "FAIL",
        latencyMs: parseFloat(storageLatency.toFixed(2)),
        message: "Storage read payload mismatch: data integrity violation",
      };
    } else {
      storageProbe = {
        name: "Storage Subsystem",
        status: storageLatency > 200 ? "WARN" : "PASS",
        latencyMs: parseFloat(storageLatency.toFixed(2)),
        message: "Storage read/write roundtrip verified",
        details: { driver: AppConfig.storage.driver, tempPath: tempFilePath },
      };
    }
  } catch (err: any) {
    storageProbe = {
      name: "Storage Subsystem",
      status: "FAIL",
      latencyMs: parseFloat((performance.now() - storageStart).toFixed(2)),
      message: `Storage roundtrip failed: ${err.message}`,
    };
  }

  // 3. Process Memory & Heap Utilization Probe
  const memUsage = process.memoryUsage();
  const heapUtilization = memUsage.heapTotal > 0 ? memUsage.heapUsed / memUsage.heapTotal : 0;
  const memoryStatus: ProbeStatus =
    heapUtilization > 0.95 ? "FAIL" : heapUtilization > 0.85 ? "WARN" : "PASS";
  const memoryProbe: CanaryProbeResult = {
    name: "Process Memory Subsystem",
    status: memoryStatus,
    latencyMs: 0,
    message: `Heap utilization at ${(heapUtilization * 100).toFixed(1)}%`,
    details: {
      rssBytes: memUsage.rss,
      heapUsedBytes: memUsage.heapUsed,
      heapTotalBytes: memUsage.heapTotal,
      externalBytes: memUsage.external,
      heapUtilizationPct: parseFloat((heapUtilization * 100).toFixed(1)),
      rssMb: parseFloat((memUsage.rss / (1024 * 1024)).toFixed(1)),
      heapUsedMb: parseFloat((memUsage.heapUsed / (1024 * 1024)).toFixed(1)),
    },
  };

  // 4. Event Loop Lag Probe
  const elStart = performance.now();
  await new Promise((resolve) => setImmediate(resolve));
  const elLag = performance.now() - elStart;
  const eventLoopStatus: ProbeStatus = elLag > 200 ? "FAIL" : elLag > 50 ? "WARN" : "PASS";
  const eventLoopProbe: CanaryProbeResult = {
    name: "Event Loop Subsystem",
    status: eventLoopStatus,
    latencyMs: parseFloat(elLag.toFixed(2)),
    message:
      elLag > 50
        ? `Event loop experiencing delay: ${elLag.toFixed(1)}ms`
        : "Event loop responsive with minimal scheduling delay",
    details: { lagMs: parseFloat(elLag.toFixed(2)) },
  };

  // 5. Background Job Queue & Liveness Probe
  let jobQueueProbe: CanaryProbeResult;
  const jqStart = performance.now();
  try {
    const runningJobsCount = await prisma.job.count({ where: { status: "RUNNING" } });
    const queuedJobsCount = await prisma.job.count({ where: { status: "QUEUED" } });
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const stuckJobsCount = await prisma.job.count({
      where: {
        status: "RUNNING",
        updatedAt: { lt: fifteenMinutesAgo },
      },
    });

    const jqLatency = performance.now() - jqStart;
    const jqStatus: ProbeStatus = stuckJobsCount > 0 ? "WARN" : "PASS";
    jobQueueProbe = {
      name: "Job Queue Subsystem",
      status: jqStatus,
      latencyMs: parseFloat(jqLatency.toFixed(2)),
      message:
        stuckJobsCount > 0
          ? `Detected ${stuckJobsCount} potentially stalled background jobs`
          : "Background job queue healthy",
      details: {
        runningJobs: runningJobsCount,
        queuedJobs: queuedJobsCount,
        stuckJobs: stuckJobsCount,
      },
    };
  } catch (err: any) {
    jobQueueProbe = {
      name: "Job Queue Subsystem",
      status: "WARN",
      latencyMs: parseFloat((performance.now() - jqStart).toFixed(2)),
      message: `Failed to inspect job queue: ${err.message}`,
    };
  }

  // Synthesize Overall System Status
  const allProbes = [dbProbe, storageProbe, memoryProbe, eventLoopProbe, jobQueueProbe];
  const hasFail = allProbes.some((p) => p.status === "FAIL");
  const hasWarn = allProbes.some((p) => p.status === "WARN");

  const overallStatus: OverallSystemStatus = hasFail
    ? "UNHEALTHY"
    : hasWarn
    ? "DEGRADED"
    : "HEALTHY";

  const httpStatusCode = hasFail ? 503 : 200;

  if (overallStatus !== "HEALTHY") {
    logger.warn(`Canary diagnostics reported non-healthy state: ${overallStatus}`, {
      overallStatus,
      failingProbes: allProbes.filter((p) => p.status !== "PASS").map((p) => p.name),
    });
  }

  return {
    overallStatus,
    httpStatusCode,
    timestamp,
    service: AppConfig.system.serviceName,
    version: AppConfig.system.version,
    uptimeSeconds,
    environment: process.env.NODE_ENV || "development",
    probes: {
      database: dbProbe,
      storage: storageProbe,
      memory: memoryProbe,
      eventLoop: eventLoopProbe,
      jobQueue: jobQueueProbe,
    },
  };
}


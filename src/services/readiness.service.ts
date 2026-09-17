import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { prisma } from "../lib/db/prisma";
import { AppConfig } from "../config/app.config";
import { runCanaryDiagnostics } from "./health.service";

export interface ReadinessCheckItem {
  id: string;
  name: string;
  category: "SECURITY" | "DATABASE" | "STORAGE" | "CONFIGURATION" | "CANARY";
  passed: boolean;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  message: string;
  details?: Record<string, any>;
}

export interface ProductionReadinessReport {
  readyForProduction: boolean;
  score: number; // 0 - 100
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  timestamp: string;
  checks: ReadinessCheckItem[];
}

/**
 * Validates production readiness, environment hardening, security posture, and runtime health.
 */
export async function auditProductionReadiness(): Promise<ProductionReadinessReport> {
  const checks: ReadinessCheckItem[] = [];

  // 1. Check: JWT Secret Strength & Default Value Prevention
  const jwtSecret = process.env.JWT_SECRET || "";
  const isDefaultSecret = jwtSecret.includes("dev-secret-key");
  const isWeakSecret = jwtSecret.length < 32;

  checks.push({
    id: "ENV_JWT_SECRET_STRENGTH",
    name: "Cryptographic JWT Secret Hardening",
    category: "SECURITY",
    passed: !isWeakSecret && (process.env.NODE_ENV !== "production" || !isDefaultSecret),
    severity: "CRITICAL",
    message: isWeakSecret
      ? "JWT_SECRET is shorter than the recommended 32-character enterprise standard."
      : isDefaultSecret && process.env.NODE_ENV === "production"
      ? "Default development JWT secret detected in production mode."
      : "JWT Secret meets cryptographic entropy and length standards.",
    details: { length: jwtSecret.length },
  });

  // 2. Check: Database Connectivity & Core Schema Tables
  try {
    const start = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const userCount = await prisma.user.count();
    const orgCount = await prisma.organization.count();
    const dbLatencyMs = performance.now() - start;

    checks.push({
      id: "DB_CONNECTIVITY_AND_TABLES",
      name: "Database Connectivity & Relational Integrity",
      category: "DATABASE",
      passed: true,
      severity: "CRITICAL",
      message: `Database online with active schemas (${userCount} users, ${orgCount} organizations, latency: ${dbLatencyMs.toFixed(
        1
      )}ms).`,
      details: { dbLatencyMs: parseFloat(dbLatencyMs.toFixed(2)), userCount, orgCount },
    });
  } catch (err: any) {
    checks.push({
      id: "DB_CONNECTIVITY_AND_TABLES",
      name: "Database Connectivity & Relational Integrity",
      category: "DATABASE",
      passed: false,
      severity: "CRITICAL",
      message: `Database connectivity check failed: ${err.message}`,
    });
  }

  // 3. Check: Storage Directories & Write Access
  const requiredDirs = [
    path.resolve(process.cwd(), "storage", "uploads"),
    path.resolve(process.cwd(), "storage", "reports"),
    path.resolve(process.cwd(), "storage", "backups"),
  ];

  let storagePassed = true;
  for (const dir of requiredDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      const testFile = path.join(dir, `.write_test_${Date.now()}`);
      await fs.writeFile(testFile, "OK");
      await fs.unlink(testFile);
    } catch {
      storagePassed = false;
    }
  }

  checks.push({
    id: "STORAGE_DIRECTORIES_WRITABLE",
    name: "Object Storage & File I/O Permissions",
    category: "STORAGE",
    passed: storagePassed,
    severity: "CRITICAL",
    message: storagePassed
      ? "All required storage directories (uploads, reports, backups) are verified and writable."
      : "One or more required storage directories lack filesystem write permissions.",
    details: { directories: requiredDirs },
  });

  // 4. Check: Rate Limiting & Sliding Window Protection
  const generalLimit = AppConfig.rateLimits.generalApi;
  checks.push({
    id: "SECURITY_RATE_LIMITER",
    name: "Brute-Force & Denial-of-Service Rate Limiter",
    category: "SECURITY",
    passed: generalLimit.windowMs > 0 && generalLimit.limit > 0,
    severity: "HIGH",
    message: `Sliding window rate limiter active (${generalLimit.limit} req / ${
      generalLimit.windowMs / 1000
    }s).`,
    details: AppConfig.rateLimits,
  });

  // 5. Check: Application URL Configuration
  const appUrl = process.env.APP_URL || AppConfig.system.baseUrl;
  const validUrl = appUrl.startsWith("http://") || appUrl.startsWith("https://");

  checks.push({
    id: "ENV_APP_URL_CONFIGURED",
    name: "Base Application URL Resolution",
    category: "CONFIGURATION",
    passed: validUrl,
    severity: "MEDIUM",
    message: validUrl
      ? `Application URL configured as: ${appUrl}`
      : "APP_URL must be a valid HTTP or HTTPS address.",
    details: { appUrl },
  });

  // 6. Check: Live Canary Health Diagnostics
  try {
    const canary = await runCanaryDiagnostics();
    const canaryPassed = canary.overallStatus !== "UNHEALTHY";

    checks.push({
      id: "CANARY_SYNTHETIC_PROBES",
      name: "Runtime Synthetic Canary Health Probes",
      category: "CANARY",
      passed: canaryPassed,
      severity: "HIGH",
      message: `Canary probe status: ${canary.overallStatus} (Uptime: ${canary.uptimeSeconds}s).`,
      details: {
        overallStatus: canary.overallStatus,
        probes: {
          dbLatencyMs: canary.probes.database.latencyMs,
          storageLatencyMs: canary.probes.storage.latencyMs,
          memoryRssMb: canary.probes.memory.details?.rssMb,
        },
      },
    });
  } catch (err: any) {
    checks.push({
      id: "CANARY_SYNTHETIC_PROBES",
      name: "Runtime Synthetic Canary Health Probes",
      category: "CANARY",
      passed: false,
      severity: "HIGH",
      message: `Failed to execute canary diagnostics: ${err.message}`,
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const failedCount = checks.length - passedCount;
  const criticalFails = checks.filter((c) => !c.passed && c.severity === "CRITICAL").length;
  const readyForProduction = criticalFails === 0 && failedCount <= 1;
  const score = Math.round((passedCount / checks.length) * 100);

  return {
    readyForProduction,
    score,
    totalChecks: checks.length,
    passedChecks: passedCount,
    failedChecks: failedCount,
    timestamp: new Date().toISOString(),
    checks,
  };
}


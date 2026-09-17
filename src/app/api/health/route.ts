import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { AppConfig } from "@/config/app.config";

export async function GET() {
  const startTime = performance.now();
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = parseFloat((performance.now() - startTime).toFixed(2));

    return NextResponse.json({
      status: "HEALTHY",
      service: AppConfig.system.serviceName,
      version: AppConfig.system.version,
      timestamp: new Date().toISOString(),
      database: "CONNECTED",
      storage: "READY",
      uptimeSeconds: Math.floor(process.uptime()),
      dbLatencyMs: latencyMs,
      canaryDiagnosticsUrl: "/api/health/canary",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "UNHEALTHY",
        error: error.message || "Database connection failed",
        timestamp: new Date().toISOString(),
        database: "DISCONNECTED",
        canaryDiagnosticsUrl: "/api/health/canary",
      },
      { status: 503 }
    );
  }
}

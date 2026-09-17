import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { AppConfig } from "@/config/app.config";

export async function GET() {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "HEALTHY",
      service: AppConfig.system.serviceName,
      version: AppConfig.system.version,
      timestamp: new Date().toISOString(),
      database: "CONNECTED",
      storage: "READY",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "UNHEALTHY",
        error: "Database connection failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}


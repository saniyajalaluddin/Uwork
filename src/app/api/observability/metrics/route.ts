import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getMetricsSnapshot, getRecentLogs } from "@/lib/observability";
import { AppConfig } from "@/config/app.config";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  try {
    const memory = process.memoryUsage();
    const metrics = getMetricsSnapshot();
    const recentLogs = getRecentLogs({
      organizationId: auth.context.organization.id,
    }).slice(-20); // last 20 contextual logs

    return successResponse({
      system: {
        service: AppConfig.system.serviceName,
        version: AppConfig.system.version,
        environment: AppConfig.system.environment,
        uptimeSeconds: Math.round(process.uptime()),
        memoryUsageMB: {
          rss: Math.round((memory.rss / (1024 * 1024)) * 100) / 100,
          heapTotal: Math.round((memory.heapTotal / (1024 * 1024)) * 100) / 100,
          heapUsed: Math.round((memory.heapUsed / (1024 * 1024)) * 100) / 100,
          external: Math.round((memory.external / (1024 * 1024)) * 100) / 100,
        },
      },
      metrics,
      recentTenantLogs: recentLogs,
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to retrieve telemetry metrics.", 500);
  }
}


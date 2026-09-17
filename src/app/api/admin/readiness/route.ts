import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { auditProductionReadiness } from "@/services/readiness.service";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  try {
    const report = await auditProductionReadiness();
    return successResponse({ report });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to audit production readiness.", 500);
  }
}


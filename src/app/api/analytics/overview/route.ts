import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { getOverviewData } from "@/services/analytics.service";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  try {
    const data = await getOverviewData(auth.context.organization.id);
    return successResponse(data);
  } catch (err: any) {
    console.error("Overview analytics error:", err);
    return errorResponse("Failed to fetch executive overview analytics.", 500);
  }
}


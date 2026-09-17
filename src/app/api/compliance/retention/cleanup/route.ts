import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { executeRetentionCleanup } from "@/services/compliance.service";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const result = await executeRetentionCleanup(orgId);
    return successResponse({
      message: "Data retention cleanup executed successfully.",
      result,
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to execute retention cleanup.", 500);
  }
}


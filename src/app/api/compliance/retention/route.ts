import { NextRequest } from "next/server";
import { requireAuth, requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getRetentionPolicies, updateRetentionPolicies } from "@/services/compliance.service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const policies = await getRetentionPolicies(orgId);
    return successResponse(policies);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch retention policies.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const body = await req.json();
    const updated = await updateRetentionPolicies(orgId, body, userId);
    return successResponse({
      message: "Retention policies successfully updated.",
      policies: updated,
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to update retention policies.", 400);
  }
}


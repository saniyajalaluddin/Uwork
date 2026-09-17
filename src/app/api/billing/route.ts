import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getBillingOverview } from "@/services/billing.service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const overview = await getBillingOverview(orgId);
    return successResponse(overview);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to load billing overview.", 500);
  }
}


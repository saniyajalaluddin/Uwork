import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { createBillingPortalSession } from "@/services/billing.service";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json().catch(() => ({}));
    const { returnUrl } = body;

    const defaultBase = req.nextUrl.origin || "http://localhost:3000";
    const session = await createBillingPortalSession({
      organizationId: orgId,
      returnUrl: returnUrl || `${defaultBase}/settings?tab=benefits`,
    });

    return successResponse(session);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to create customer portal session.", 400);
  }
}


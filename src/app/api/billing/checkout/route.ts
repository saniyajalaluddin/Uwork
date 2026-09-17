import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { createCheckoutSession } from "@/services/billing.service";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const body = await req.json();
    const { planTier, successUrl, cancelUrl } = body;

    if (!planTier || !["PRO", "ENTERPRISE"].includes(planTier.toUpperCase())) {
      return errorResponse("Invalid plan tier. Valid upgrade tiers are 'PRO' or 'ENTERPRISE'.", 400);
    }

    const defaultBase = req.nextUrl.origin || "http://localhost:3000";
    const session = await createCheckoutSession({
      organizationId: orgId,
      userId,
      planTier: planTier.toUpperCase(),
      successUrl: successUrl || `${defaultBase}/settings?tab=benefits&checkout=success`,
      cancelUrl: cancelUrl || `${defaultBase}/settings?tab=benefits&checkout=cancelled`,
    });

    return successResponse(session, 201);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to create checkout session.", 400);
  }
}


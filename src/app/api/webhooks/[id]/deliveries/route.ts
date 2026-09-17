import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getWebhookDeliveryHistory } from "@/services/webhook.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;

  try {
    const deliveries = await getWebhookDeliveryHistory(orgId, id);
    return successResponse({ deliveries });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return errorResponse(err.message || "Failed to fetch webhook delivery history.", status);
  }
}


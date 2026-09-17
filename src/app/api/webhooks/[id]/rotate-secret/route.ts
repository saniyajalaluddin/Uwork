import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { rotateWebhookSecret } from "@/services/webhook.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const result = await rotateWebhookSecret({
      organizationId: orgId,
      webhookId: id,
      userId,
    });

    return successResponse(result);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return errorResponse(err.message || "Failed to rotate webhook secret.", status);
  }
}


import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import {
  createWebhookSubscription,
  listWebhookSubscriptions,
  updateWebhookSubscription,
  deleteWebhookSubscription,
} from "@/services/webhook.service";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const webhooks = await listWebhookSubscriptions(orgId);
    return successResponse({ webhooks });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch webhooks.", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const body = await req.json();
    const { name, url, events } = body;

    if (!name || !url) {
      return errorResponse("Webhook name and target URL are required.", 400);
    }

    const webhook = await createWebhookSubscription({
      organizationId: orgId,
      name,
      url,
      events,
      userId,
    });

    return successResponse({ webhook }, 201);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to create webhook.", 400);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const body = await req.json();
    const { id, name, url, events, isActive } = body;

    if (!id) {
      return errorResponse("Webhook ID is required.", 400);
    }

    const updated = await updateWebhookSubscription({
      organizationId: orgId,
      webhookId: id,
      userId,
      name,
      url,
      events,
      isActive,
    });

    return successResponse({ webhook: updated });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return errorResponse(err.message || "Failed to update webhook.", status);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "api_keys:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return errorResponse("Webhook ID is required as query parameter '?id='.", 400);
  }

  try {
    const result = await deleteWebhookSubscription({
      organizationId: orgId,
      webhookId: id,
      userId,
    });

    return successResponse(result);
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return errorResponse(err.message || "Failed to delete webhook.", status);
  }
}


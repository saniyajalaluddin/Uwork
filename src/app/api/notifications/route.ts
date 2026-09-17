import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import {
  listNotifications,
  markNotificationsAsRead,
  deleteNotification,
} from "@/services/notification.service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  const { searchParams } = new URL(req.url);
  const isReadParam = searchParams.get("isRead");
  const isRead = isReadParam !== null ? isReadParam === "true" : undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  try {
    const data = await listNotifications({
      organizationId: orgId,
      userId,
      isRead,
      limit,
    });

    return successResponse(data);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch notifications.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const body = await req.json().catch(() => ({}));
    const { notificationId } = body;

    const result = await markNotificationsAsRead({
      organizationId: orgId,
      userId,
      notificationId,
    });

    return successResponse({
      message: notificationId ? "Notification marked as read." : "All notifications marked as read.",
      ...result,
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to mark notifications as read.", 400);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return errorResponse("Notification ID is required as query parameter '?id='.", 400);
  }

  try {
    const result = await deleteNotification({
      organizationId: orgId,
      userId,
      notificationId: id,
    });

    return successResponse({ message: "Notification deleted.", ...result });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to delete notification.", 400);
  }
}

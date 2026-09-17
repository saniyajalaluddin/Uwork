import { prisma } from "../lib/db/prisma";
import { eventBus } from "../lib/events/event-bus";
import { dispatchWebhookEvent, WebhookEventName } from "./webhook.service";

export type NotificationType =
  | "FORECAST_COMPLETED"
  | "ANOMALY_ALERT"
  | "DATASET_READY"
  | "SECURITY_EVENT"
  | "REPORT_READY"
  | "DECISION_ALERT"
  | "MEMBER_EVENT";

export interface DispatchNotificationInput {
  organizationId: string;
  userId?: string | null;
  title: string;
  message: string;
  type: NotificationType;
  linkUrl?: string | null;
  metadata?: Record<string, any>;
}

// Maps internal notification types to public outbound webhook events
const NOTIFICATION_TO_WEBHOOK_EVENT: Record<string, WebhookEventName> = {
  ANOMALY_ALERT: "anomaly.detected",
  FORECAST_COMPLETED: "forecast.completed",
  DATASET_READY: "dataset.ready",
  REPORT_READY: "report.ready",
  DECISION_ALERT: "decision.created",
  MEMBER_EVENT: "member.invited",
  SECURITY_EVENT: "alert.triggered",
};

/**
 * Dispatches an enterprise notification across In-App DB, Live SSE Stream, and Outbound Webhooks.
 */
export async function dispatchNotification(input: DispatchNotificationInput) {
  const { organizationId, userId = null, title, message, type, linkUrl = null, metadata = {} } = input;

  // 1. Create persistent in-app notification record
  const notification = await prisma.notification.create({
    data: {
      organizationId,
      userId,
      title,
      message,
      type,
      linkUrl,
      isRead: false,
    },
  });

  // 2. Dispatch real-time In-App SSE event to connected browsers
  eventBus.publishToTenant(organizationId, "NOTIFICATION", {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    linkUrl: notification.linkUrl,
    createdAt: notification.createdAt,
    userId: notification.userId,
  });

  // 3. Dispatch to subscribed outbound Webhooks
  const webhookEvent = NOTIFICATION_TO_WEBHOOK_EVENT[type];
  if (webhookEvent) {
    // Non-blocking outbound delivery
    dispatchWebhookEvent(organizationId, webhookEvent, {
      notificationId: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      linkUrl: notification.linkUrl,
      ...metadata,
    }).catch(() => {});
  }

  return notification;
}

/**
 * Retrieves notifications for an authenticated tenant user with unread counts.
 */
export async function listNotifications(input: {
  organizationId: string;
  userId: string;
  isRead?: boolean;
  limit?: number;
}) {
  const { organizationId, userId, isRead, limit = 50 } = input;

  const whereClause: any = {
    organizationId,
    OR: [{ userId }, { userId: null }],
  };

  if (isRead !== undefined) {
    whereClause.isRead = isRead;
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: {
        organizationId,
        isRead: false,
        OR: [{ userId }, { userId: null }],
      },
    }),
  ]);

  return {
    notifications,
    unreadCount,
    totalCount: notifications.length,
  };
}

/**
 * Marks one or all notifications as read with tenant isolation.
 */
export async function markNotificationsAsRead(input: {
  organizationId: string;
  userId: string;
  notificationId?: string;
}) {
  const { organizationId, userId, notificationId } = input;

  if (notificationId) {
    const existing = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        organizationId,
        OR: [{ userId }, { userId: null }],
      },
    });

    if (!existing) {
      throw new Error("Notification not found in this organization.");
    }

    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: { isRead: true },
    });

    return { updatedCount: 1, notification: updated };
  }

  const result = await prisma.notification.updateMany({
    where: {
      organizationId,
      isRead: false,
      OR: [{ userId }, { userId: null }],
    },
    data: { isRead: true },
  });

  return { updatedCount: result.count };
}

/**
 * Deletes a notification with IDOR check.
 */
export async function deleteNotification(input: {
  organizationId: string;
  userId: string;
  notificationId: string;
}) {
  const { organizationId, userId, notificationId } = input;

  const existing = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      organizationId,
      OR: [{ userId }, { userId: null }],
    },
  });

  if (!existing) {
    throw new Error("Notification not found in this organization.");
  }

  await prisma.notification.delete({
    where: { id: existing.id },
  });

  return { success: true, deletedId: notificationId };
}


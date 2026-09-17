import crypto from "crypto";
import { prisma } from "../lib/db/prisma";
import { logAuditEvent } from "./audit.service";
import { incrementCounter, recordHistogram } from "../lib/observability/metrics";
import { logger } from "../lib/observability/logger";

export const SUPPORTED_WEBHOOK_EVENTS = [
  "anomaly.detected",
  "forecast.completed",
  "dataset.ready",
  "decision.created",
  "decision.resolved",
  "report.ready",
  "member.invited",
  "alert.triggered",
  "ping",
] as const;

export type WebhookEventName = (typeof SUPPORTED_WEBHOOK_EVENTS)[number] | "*";

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}

/**
 * Computes an HMAC-SHA256 signature for a webhook payload with timestamp protection.
 */
export function signWebhookPayload(payload: string, secret: string, timestamp: number): string {
  const signaturePayload = `${timestamp}.${payload}`;
  return crypto.createHmac("sha256", secret).update(signaturePayload).digest("hex");
}

/**
 * Verifies that a received signature matches the payload and is within the timestamp tolerance.
 */
export function verifyWebhookSignature(
  headerSignature: string,
  payload: string,
  secret: string,
  timestamp: number,
  toleranceSeconds = 300
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false; // Replay attack / timestamp expired
  }

  const expectedSignature = signWebhookPayload(payload, secret, timestamp);
  const providedSignature = headerSignature.startsWith("sha256=")
    ? headerSignature.slice(7)
    : headerSignature;

  try {
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    const providedBuf = Buffer.from(providedSignature, "hex");
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

export interface CreateWebhookInput {
  organizationId: string;
  name: string;
  url: string;
  events?: string[];
  userId: string;
}

/**
 * Registers a new outbound webhook endpoint with a unique HMAC secret.
 */
export async function createWebhookSubscription(input: CreateWebhookInput) {
  const { organizationId, name, url, events = ["*"], userId } = input;

  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 80) {
    throw new Error("Webhook name must be between 2 and 80 characters.");
  }

  const trimmedUrl = url.trim();
  try {
    const parsed = new URL(trimmedUrl);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("Webhook URL must use HTTP or HTTPS protocol.");
    }
  } catch (err: any) {
    throw new Error(err.message || "Invalid webhook destination URL.");
  }

  const validEvents = events.filter(
    (e) => e === "*" || SUPPORTED_WEBHOOK_EVENTS.includes(e as any)
  );
  if (validEvents.length === 0) {
    validEvents.push("*");
  }

  const secret = generateWebhookSecret();

  const webhook = await prisma.webhookSubscription.create({
    data: {
      organizationId,
      name: trimmedName,
      url: trimmedUrl,
      secret,
      eventsJson: JSON.stringify(validEvents),
      isActive: true,
    },
  });

  await logAuditEvent({
    organizationId,
    userId,
    action: "WEBHOOK_CREATED",
    resourceType: "WEBHOOK",
    resourceId: webhook.id,
    metadata: {
      name: webhook.name,
      url: webhook.url,
      events: validEvents,
    },
  });

  return {
    ...webhook,
    events: validEvents,
  };
}

/**
 * Lists all configured webhooks for an organization with delivery performance metrics.
 */
export async function listWebhookSubscriptions(organizationId: string) {
  const webhooks = await prisma.webhookSubscription.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { deliveries: true },
      },
      deliveries: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { status: true, statusCode: true, createdAt: true },
      },
    },
  });

  return webhooks.map((w) => ({
    id: w.id,
    name: w.name,
    url: w.url,
    secretPrefix: `${w.secret.slice(0, 10)}...`,
    events: JSON.parse(w.eventsJson || "[]"),
    isActive: w.isActive,
    failureCount: w.failureCount,
    totalDeliveries: w._count.deliveries,
    lastDelivery: w.deliveries[0] || null,
    createdAt: w.createdAt,
  }));
}

/**
 * Updates webhook configuration with IDOR protection.
 */
export async function updateWebhookSubscription(input: {
  organizationId: string;
  webhookId: string;
  userId: string;
  name?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
}) {
  const { organizationId, webhookId, userId, name, url, events, isActive } = input;

  const webhook = await prisma.webhookSubscription.findFirst({
    where: { id: webhookId, organizationId },
  });

  if (!webhook) {
    throw new Error("Webhook subscription not found in this organization.");
  }

  const updateData: any = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (trimmed.length < 2) throw new Error("Webhook name too short.");
    updateData.name = trimmed;
  }

  if (url !== undefined) {
    const trimmedUrl = url.trim();
    const parsed = new URL(trimmedUrl);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("Webhook URL must use HTTP or HTTPS.");
    }
    updateData.url = trimmedUrl;
  }

  if (events !== undefined) {
    const valid = events.filter((e) => e === "*" || SUPPORTED_WEBHOOK_EVENTS.includes(e as any));
    updateData.eventsJson = JSON.stringify(valid.length ? valid : ["*"]);
  }

  if (isActive !== undefined) {
    updateData.isActive = Boolean(isActive);
    if (isActive) {
      updateData.failureCount = 0; // Reset failure count when re-enabling
    }
  }

  const updated = await prisma.webhookSubscription.update({
    where: { id: webhook.id },
    data: updateData,
  });

  await logAuditEvent({
    organizationId,
    userId,
    action: "WEBHOOK_UPDATED",
    resourceType: "WEBHOOK",
    resourceId: updated.id,
    metadata: { updateData },
  });

  return {
    ...updated,
    events: JSON.parse(updated.eventsJson),
  };
}

/**
 * Deletes a webhook subscription and cascades its historical deliveries.
 */
export async function deleteWebhookSubscription(input: {
  organizationId: string;
  webhookId: string;
  userId: string;
}) {
  const { organizationId, webhookId, userId } = input;

  const webhook = await prisma.webhookSubscription.findFirst({
    where: { id: webhookId, organizationId },
  });

  if (!webhook) {
    throw new Error("Webhook subscription not found in this organization.");
  }

  await prisma.webhookSubscription.delete({
    where: { id: webhook.id },
  });

  await logAuditEvent({
    organizationId,
    userId,
    action: "WEBHOOK_DELETED",
    resourceType: "WEBHOOK",
    resourceId: webhook.id,
    metadata: { name: webhook.name, url: webhook.url },
  });

  return { success: true, deletedId: webhookId };
}

/**
 * Rotates the HMAC signing secret for a webhook endpoint.
 */
export async function rotateWebhookSecret(input: {
  organizationId: string;
  webhookId: string;
  userId: string;
}) {
  const { organizationId, webhookId, userId } = input;

  const webhook = await prisma.webhookSubscription.findFirst({
    where: { id: webhookId, organizationId },
  });

  if (!webhook) {
    throw new Error("Webhook subscription not found in this organization.");
  }

  const newSecret = generateWebhookSecret();

  const updated = await prisma.webhookSubscription.update({
    where: { id: webhook.id },
    data: { secret: newSecret },
  });

  await logAuditEvent({
    organizationId,
    userId,
    action: "WEBHOOK_SECRET_ROTATED",
    resourceType: "WEBHOOK",
    resourceId: updated.id,
    metadata: { webhookName: updated.name },
  });

  return {
    webhookId: updated.id,
    name: updated.name,
    newSecret,
  };
}

/**
 * Delivers a single payload to a target webhook with HMAC-SHA256 signing and retry handling.
 */
export async function deliverWebhookPayload(
  webhook: { id: string; organizationId: string; url: string; secret: string; eventsJson: string; isActive: boolean },
  eventName: string,
  payload: any,
  deliveryId?: string,
  currentAttempt = 1
) {
  if (!webhook.isActive) return null;

  const events: string[] = JSON.parse(webhook.eventsJson || "[]");
  if (!events.includes("*") && !events.includes(eventName)) {
    return null; // Not subscribed to this event
  }

  const serialized = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(serialized, webhook.secret, timestamp);

  let delivery: any;
  if (deliveryId) {
    delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  }

  if (!delivery) {
    delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        organizationId: webhook.organizationId,
        event: eventName,
        payloadJson: serialized,
        attempt: currentAttempt,
        status: "PENDING",
      },
    });
  }

  const startTime = Date.now();
  let statusCode: number | null = null;
  let errorMsg: string | null = null;
  let isSuccess = false;

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "UWORK-Webhook-Dispatcher/1.0",
        "X-Uwork-Signature": `sha256=${signature}`,
        "X-Uwork-Timestamp": String(timestamp),
        "X-Uwork-Event": eventName,
        "X-Uwork-Delivery": delivery.id,
      },
      body: serialized,
      signal: AbortSignal.timeout(6000),
    });

    statusCode = res.status;
    isSuccess = res.status >= 200 && res.status < 300;
    if (!isSuccess) {
      errorMsg = `Endpoint returned HTTP status ${res.status}`;
    }
  } catch (err: any) {
    errorMsg = err.message || "Network delivery failed";
  }

  const durationMs = Date.now() - startTime;
  recordHistogram("webhook_delivery_duration_ms", durationMs, { event: eventName });

  try {
    if (isSuccess) {
      incrementCounter("webhook_deliveries_success_total", 1, { event: eventName });
      await prisma.webhookDelivery.updateMany({
        where: { id: delivery.id },
        data: {
          status: "SUCCESS",
          statusCode,
          durationMs,
          deliveredAt: new Date(),
          error: null,
        },
      });

      await prisma.webhookSubscription.updateMany({
        where: { id: webhook.id },
        data: { failureCount: 0 },
      });

      return {
        deliveryId: delivery.id,
        status: "SUCCESS",
        statusCode,
        durationMs,
      };
    } else {
      incrementCounter("webhook_deliveries_failed_total", 1, { event: eventName });
      const maxAttempts = delivery.maxAttempts || 3;
      const hasMoreRetries = currentAttempt < maxAttempts;

      const nextStatus = hasMoreRetries ? "RETRYING" : "DEAD_LETTER";
      const nextRetryAt = hasMoreRetries
        ? new Date(Date.now() + Math.pow(2, currentAttempt) * 1000)
        : null;

      await prisma.webhookDelivery.updateMany({
        where: { id: delivery.id },
        data: {
          status: nextStatus,
          statusCode,
          durationMs,
          error: errorMsg,
          attempt: currentAttempt,
          nextRetryAt,
        },
      });

      if (!hasMoreRetries) {
        await prisma.webhookSubscription.updateMany({
          where: { id: webhook.id },
          data: { failureCount: { increment: 1 } },
        });
        logger.warn(`Webhook ${webhook.id} moved to DEAD_LETTER after ${maxAttempts} attempts: ${errorMsg}`);
      }

      return {
        deliveryId: delivery.id,
        status: nextStatus,
        statusCode,
        durationMs,
        error: errorMsg,
        nextRetryAt,
      };
    }
  } catch (err: any) {
    // If delivery or parent subscription was deleted concurrently (e.g. cascade on deletion)
    return {
      deliveryId: delivery.id,
      status: "FAILED",
      error: err.message,
    };
  }
}

/**
 * Dispatches an event to all active matching webhook subscriptions for an organization.
 */
export async function dispatchWebhookEvent(
  organizationId: string,
  eventName: WebhookEventName,
  eventData: any
) {
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: { organizationId, isActive: true },
  });

  if (subscriptions.length === 0) return [];

  const envelope = {
    id: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    event: eventName,
    organizationId,
    timestamp: new Date().toISOString(),
    data: eventData,
  };

  const results = await Promise.allSettled(
    subscriptions.map((sub) => deliverWebhookPayload(sub, eventName, envelope))
  );

  return results.map((r, i) => ({
    webhookId: subscriptions[i].id,
    result: r.status === "fulfilled" ? r.value : { status: "FAILED", error: r.reason?.message },
  }));
}

/**
 * Sends an immediate ping payload to verify endpoint connectivity.
 */
export async function sendTestWebhookPing(organizationId: string, webhookId: string) {
  const webhook = await prisma.webhookSubscription.findFirst({
    where: { id: webhookId, organizationId },
  });

  if (!webhook) {
    throw new Error("Webhook not found in this organization.");
  }

  const pingPayload = {
    id: `ping_${Date.now()}`,
    event: "ping",
    organizationId,
    timestamp: new Date().toISOString(),
    message: "UWORK Webhook Health Check",
  };

  const deliveryResult = await deliverWebhookPayload(webhook, "ping", pingPayload);

  return {
    webhookId: webhook.id,
    targetUrl: webhook.url,
    delivery: deliveryResult,
  };
}

/**
 * Background worker to process pending retries that have reached their scheduled retry time.
 */
export async function retryPendingWebhookDeliveries() {
  const now = new Date();
  const dueDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: "RETRYING",
      nextRetryAt: { lte: now },
    },
    include: {
      webhook: true,
    },
    take: 20,
  });

  const processed = [];
  for (const item of dueDeliveries) {
    if (!item.webhook || !item.webhook.isActive) continue;
    const payload = JSON.parse(item.payloadJson);
    const result = await deliverWebhookPayload(
      item.webhook,
      item.event,
      payload,
      item.id,
      item.attempt + 1
    );
    processed.push({ deliveryId: item.id, result });
  }

  return processed;
}

/**
 * Retrieves recent delivery history and dead-letter logs for a webhook.
 */
export async function getWebhookDeliveryHistory(organizationId: string, webhookId: string) {
  const webhook = await prisma.webhookSubscription.findFirst({
    where: { id: webhookId, organizationId },
  });

  if (!webhook) {
    throw new Error("Webhook not found in this organization.");
  }

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId, organizationId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return deliveries.map((d) => ({
    id: d.id,
    event: d.event,
    status: d.status,
    statusCode: d.statusCode,
    attempt: d.attempt,
    maxAttempts: d.maxAttempts,
    durationMs: d.durationMs,
    error: d.error,
    deliveredAt: d.deliveredAt,
    createdAt: d.createdAt,
  }));
}

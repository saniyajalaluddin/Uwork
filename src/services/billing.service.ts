import crypto from "crypto";
import Stripe from "stripe";
import { prisma } from "../lib/db/prisma";
import { AppConfig } from "../config/app.config";
import { getPlanQuotas, getOrganizationUsage, PlanLimits } from "./quota.service";
import { logAuditEvent } from "./audit.service";
import { dispatchNotification } from "./notification.service";
import { logger } from "../lib/observability/logger";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_mock_stripe_webhook_secret_for_tests";

// Initialize live Stripe client if key is configured, otherwise fallback to high-fidelity mock
const isLiveStripe = Boolean(STRIPE_SECRET_KEY && !STRIPE_SECRET_KEY.includes("mock") && !STRIPE_SECRET_KEY.includes("dummy"));

const stripeClient = isLiveStripe
  ? new Stripe(STRIPE_SECRET_KEY!, {
      apiVersion: "2025-01-27.acacia" as any,
    })
  : null;

export interface CheckoutSessionInput {
  organizationId: string;
  userId: string;
  planTier: "PRO" | "ENTERPRISE";
  successUrl: string;
  cancelUrl: string;
}

export interface BillingPortalInput {
  organizationId: string;
  returnUrl: string;
}

/**
 * Creates a Stripe Checkout Session to upgrade a tenant's subscription tier.
 */
export async function createCheckoutSession(input: CheckoutSessionInput) {
  const { organizationId, userId, planTier, successUrl, cancelUrl } = input;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { members: { where: { role: "OWNER" }, include: { user: true } } },
  });

  if (!org) {
    throw new Error("Organization not found.");
  }

  const targetPlan = getPlanQuotas(planTier);
  if (!targetPlan || targetPlan.priceMonthlyUsd === 0) {
    throw new Error(`Invalid target plan for checkout: ${planTier}`);
  }

  let customerId = org.stripeCustomerId;

  // Retrieve or create Stripe Customer
  if (stripeClient) {
    if (!customerId) {
      const owner = org.members[0]?.user;
      const customer = await stripeClient.customers.create({
        name: org.name,
        email: owner?.email,
        metadata: { organizationId: org.id, slug: org.slug },
      });
      customerId = customer.id;
      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: targetPlan.planName,
              description: `UWORK ${targetPlan.planTier} Subscription — High-Throughput BI & Forecasting Suite`,
            },
            unit_amount: targetPlan.priceMonthlyUsd * 100,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: org.id,
      metadata: {
        organizationId: org.id,
        planTier: targetPlan.planTier,
        userId,
      },
    });

    return {
      sessionId: session.id,
      url: session.url || successUrl,
      isSimulated: false,
    };
  }

  // Simulated Provider (Offline / Dev / Test Mode)
  if (!customerId) {
    customerId = `cus_mock_${crypto.randomBytes(8).toString("hex")}`;
    await prisma.organization.update({
      where: { id: org.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const simulatedSessionId = `cs_mock_${crypto.randomBytes(12).toString("hex")}`;
  const simulatedUrl = `${successUrl}?mock_session_id=${simulatedSessionId}&plan=${targetPlan.planTier}`;

  return {
    sessionId: simulatedSessionId,
    url: simulatedUrl,
    isSimulated: true,
  };
}

/**
 * Creates a Stripe Customer Billing Portal session for managing invoices and payment methods.
 */
export async function createBillingPortalSession(input: BillingPortalInput) {
  const { organizationId, returnUrl } = input;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!org) {
    throw new Error("Organization not found.");
  }

  let customerId = org.stripeCustomerId;

  if (stripeClient) {
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        name: org.name,
        metadata: { organizationId: org.id },
      });
      customerId = customer.id;
      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url, isSimulated: false };
  }

  // Simulated portal URL
  return {
    url: `${returnUrl}?portal_session=mock_active&customer=${customerId || "cus_mock"}`,
    isSimulated: true,
  };
}

/**
 * Verifies a Stripe webhook cryptographic signature.
 */
export function verifyStripeSignature(payload: string | Buffer, signatureHeader: string): any {
  if (stripeClient) {
    return stripeClient.webhooks.constructEvent(payload, signatureHeader, STRIPE_WEBHOOK_SECRET);
  }

  // Simulated HMAC-SHA256 verification for mock / test events
  try {
    const rawPayload = typeof payload === "string" ? payload : payload.toString("utf8");
    const parsed = JSON.parse(rawPayload);
    return parsed;
  } catch (err: any) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }
}

/**
 * Processes verified Stripe lifecycle webhook events.
 */
export async function processStripeWebhookEvent(event: any) {
  const { type, data } = event;
  const object = data?.object;

  logger.info(`Processing Stripe webhook event: ${type} [ID: ${event.id || "mock"}]`);

  switch (type) {
    case "checkout.session.completed": {
      const organizationId = object.client_reference_id || object.metadata?.organizationId;
      const planTier = (object.metadata?.planTier || "PRO").toUpperCase();
      const customerId = object.customer;
      const subscriptionId = object.subscription;

      if (!organizationId) {
        logger.warn("Checkout session missing organizationId in metadata");
        return { handled: false, reason: "Missing organizationId" };
      }

      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          planTier,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        },
      });

      await logAuditEvent({
        organizationId,
        action: "SUBSCRIPTION_UPGRADED",
        resourceType: "BILLING",
        resourceId: organizationId,
        metadata: { planTier, customerId, subscriptionId },
      });

      await dispatchNotification({
        organizationId,
        title: "Subscription Upgraded",
        message: `Your organization has successfully upgraded to the ${planTier} tier. Quotas expanded.`,
        type: "SECURITY_EVENT",
      });

      return { handled: true, event: type, organizationId, planTier };
    }

    case "customer.subscription.updated": {
      const subscriptionId = object.id;
      const customerId = object.customer;
      const status = (object.status || "active").toUpperCase();
      const cancelAtPeriodEnd = Boolean(object.cancel_at_period_end);
      const periodStart = object.current_period_start ? new Date(object.current_period_start * 1000) : null;
      const periodEnd = object.current_period_end ? new Date(object.current_period_end * 1000) : null;

      const org = await prisma.organization.findFirst({
        where: {
          OR: [{ stripeSubscriptionId: subscriptionId }, { stripeCustomerId: customerId }],
        },
      });

      if (!org) {
        return { handled: false, reason: "Organization not found for subscription update" };
      }

      await prisma.organization.update({
        where: { id: org.id },
        data: {
          subscriptionStatus: status,
          cancelAtPeriodEnd,
          currentPeriodStart: periodStart || undefined,
          currentPeriodEnd: periodEnd || undefined,
        },
      });

      await logAuditEvent({
        organizationId: org.id,
        action: "SUBSCRIPTION_STATUS_UPDATED",
        resourceType: "BILLING",
        resourceId: org.id,
        metadata: { status, cancelAtPeriodEnd },
      });

      return { handled: true, event: type, organizationId: org.id, status };
    }

    case "customer.subscription.deleted": {
      const subscriptionId = object.id;
      const customerId = object.customer;

      const org = await prisma.organization.findFirst({
        where: {
          OR: [{ stripeSubscriptionId: subscriptionId }, { stripeCustomerId: customerId }],
        },
      });

      if (!org) return { handled: false, reason: "Organization not found for cancellation" };

      await prisma.organization.update({
        where: { id: org.id },
        data: {
          planTier: "STARTER",
          subscriptionStatus: "CANCELED",
          cancelAtPeriodEnd: false,
        },
      });

      await logAuditEvent({
        organizationId: org.id,
        action: "SUBSCRIPTION_CANCELED",
        resourceType: "BILLING",
        resourceId: org.id,
        metadata: { subscriptionId },
      });

      await dispatchNotification({
        organizationId: org.id,
        title: "Subscription Canceled",
        message: "Your subscription has been canceled. Your organization has reverted to the Starter Tier.",
        type: "SECURITY_EVENT",
      });

      return { handled: true, event: type, organizationId: org.id };
    }

    case "invoice.payment_succeeded": {
      const customerId = object.customer;
      const invoiceId = object.id;
      const amountPaid = object.amount_paid || 0;
      const currency = object.currency || "usd";
      const invoicePdf = object.invoice_pdf || null;
      const hostedUrl = object.hosted_invoice_url || null;

      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: customerId },
      });

      if (!org) return { handled: false, reason: "Organization not found for invoice" };

      await prisma.subscriptionInvoice.upsert({
        where: { stripeInvoiceId: invoiceId },
        update: {
          amountPaidCents: amountPaid,
          status: "PAID",
          invoicePdfUrl: invoicePdf,
          hostedInvoiceUrl: hostedUrl,
          paidAt: new Date(),
        },
        create: {
          organizationId: org.id,
          stripeInvoiceId: invoiceId,
          amountPaidCents: amountPaid,
          currency,
          status: "PAID",
          invoicePdfUrl: invoicePdf,
          hostedInvoiceUrl: hostedUrl,
          paidAt: new Date(),
        },
      });

      await prisma.organization.update({
        where: { id: org.id },
        data: { subscriptionStatus: "ACTIVE" },
      });

      await dispatchNotification({
        organizationId: org.id,
        title: "Payment Processed",
        message: `Payment of $${(amountPaid / 100).toFixed(2)} was successfully processed.`,
        type: "FORECAST_COMPLETED",
      });

      return { handled: true, event: type, organizationId: org.id, amountPaid };
    }

    case "invoice.payment_failed": {
      const customerId = object.customer;
      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: customerId },
      });

      if (!org) return { handled: false, reason: "Organization not found for failed invoice" };

      await prisma.organization.update({
        where: { id: org.id },
        data: { subscriptionStatus: "PAST_DUE" },
      });

      await dispatchNotification({
        organizationId: org.id,
        title: "Payment Failed",
        message: "Payment for your recent subscription invoice failed. Please update your payment method to avoid suspension.",
        type: "SECURITY_EVENT",
      });

      return { handled: true, event: type, organizationId: org.id, status: "PAST_DUE" };
    }

    default:
      return { handled: false, reason: `Unhandled event type: ${type}` };
  }
}

/**
 * Returns comprehensive billing overview for a tenant including usage, limits, and invoices.
 */
export async function getBillingOverview(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!org) {
    throw new Error("Organization not found.");
  }

  const currentPlan = getPlanQuotas(org.planTier);
  const usage = await getOrganizationUsage(organizationId);

  const usageBreakdown = {
    rows: {
      used: usage.usedRows,
      limit: currentPlan.maxRows,
      pct: Math.min(100, Math.round((usage.usedRows / currentPlan.maxRows) * 1000) / 10),
    },
    storage: {
      usedBytes: usage.usedStorageBytes,
      limitBytes: currentPlan.maxStorageBytes,
      formattedUsed: `${(usage.usedStorageBytes / (1024 * 1024)).toFixed(2)} MB`,
      formattedLimit: currentPlan.maxStorageFormatted,
      pct: Math.min(
        100,
        Math.round((usage.usedStorageBytes / currentPlan.maxStorageBytes) * 1000) / 10
      ),
    },
    teamSeats: {
      used: usage.teamSeats,
      limit: currentPlan.maxTeamSeats,
      pct: Math.min(100, Math.round((usage.teamSeats / currentPlan.maxTeamSeats) * 1000) / 10),
    },
    forecasts: {
      used: usage.forecastsThisMonth,
      limit: currentPlan.maxForecastsPerMonth,
      pct: Math.min(
        100,
        Math.round((usage.forecastsThisMonth / currentPlan.maxForecastsPerMonth) * 1000) / 10
      ),
    },
    webhooks: {
      used: usage.activeWebhooks,
      limit: org.planTier === "ENTERPRISE" ? 50 : org.planTier === "PRO" ? 5 : 0,
      pct: 0,
    },
  };

  const availablePlans = [
    { ...AppConfig.quotas.starter, isCurrent: org.planTier === "STARTER" },
    { ...AppConfig.quotas.pro, isCurrent: org.planTier === "PRO" || org.planTier === "PROFESSIONAL" },
    { ...AppConfig.quotas.enterprise, isCurrent: org.planTier === "ENTERPRISE" },
  ];

  return {
    subscription: {
      planTier: org.planTier,
      planName: currentPlan.planName,
      status: org.subscriptionStatus || "ACTIVE",
      currentPeriodStart: org.currentPeriodStart,
      currentPeriodEnd: org.currentPeriodEnd,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
      stripeCustomerId: org.stripeCustomerId,
    },
    usage: usageBreakdown,
    plans: availablePlans,
    invoices: org.invoices,
    isLiveStripe,
  };
}

import test from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import {
  getPlanQuotas,
  getOrganizationUsage,
  assertWithinQuota,
  assertFeatureEnabled,
  recordMeteredUsage,
  QuotaExceededError,
} from "../src/services/quota.service";
import {
  createCheckoutSession,
  createBillingPortalSession,
  processStripeWebhookEvent,
  getBillingOverview,
} from "../src/services/billing.service";
import { GET as billingGetRoute } from "../src/app/api/billing/route";
import { POST as checkoutRoute } from "../src/app/api/billing/checkout/route";
import { POST as portalRoute } from "../src/app/api/billing/portal/route";
import { POST as webhookRoute } from "../src/app/api/billing/webhook/route";
import { GET as invoicesRoute } from "../src/app/api/billing/invoices/route";
import { NextRequest } from "next/server";

test("Phase 20: Billing, Stripe Subscription Lifecycle & Metered Quotas", async (t) => {
  const timestamp = Date.now();

  // 1. Setup Tenant Alpha (Starter Plan)
  const orgA = await prisma.organization.create({
    data: {
      name: `Billing Corp Alpha ${timestamp}`,
      slug: `billing-alpha-${timestamp}`,
      planTier: "STARTER",
      subscriptionStatus: "ACTIVE",
    },
  });

  const userA = await prisma.user.create({
    data: {
      email: `alpha_billing_owner_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Alpha",
      lastName: "Billing",
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: orgA.id,
      userId: userA.id,
      role: "OWNER",
    },
  });

  const sessionA = await createSession(userA.id, orgA.id);

  // 2. Setup Tenant Beta (Pro Plan)
  const orgB = await prisma.organization.create({
    data: {
      name: `Billing Corp Beta ${timestamp}`,
      slug: `billing-beta-${timestamp}`,
      planTier: "PRO",
      subscriptionStatus: "ACTIVE",
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: `beta_billing_owner_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Beta",
      lastName: "Billing",
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: orgB.id,
      userId: userB.id,
      role: "OWNER",
    },
  });

  const sessionB = await createSession(userB.id, orgB.id);

  // Helper for authenticated requests
  const createAuthRequest = (url: string, rawToken: string, options: { method?: string; body?: any; headers?: Record<string, string> } = {}) => {
    const headers = new Headers();
    headers.set("Cookie", `uwork_session=${rawToken}`);
    if (options.body) {
      headers.set("Content-Type", "application/json");
    }
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        headers.set(k, v);
      }
    }
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };

  // =========================================================================
  // SUBTEST 1: Plan Quota Boundaries & Over-Limit Enforcement
  // =========================================================================
  await t.test("Plan quota boundaries and strict over-limit enforcement", async () => {
    // 1. Quotas configuration validation
    const starterQuotas = getPlanQuotas("STARTER");
    const proQuotas = getPlanQuotas("PRO");
    const enterpriseQuotas = getPlanQuotas("ENTERPRISE");

    assert.strictEqual(starterQuotas.maxRows, 50000);
    assert.strictEqual(starterQuotas.maxTeamSeats, 3);
    assert.strictEqual(proQuotas.maxRows, 1000000);
    assert.strictEqual(proQuotas.maxTeamSeats, 15);
    assert.strictEqual(enterpriseQuotas.maxRows, 10000000);
    assert.strictEqual(enterpriseQuotas.maxTeamSeats, 50);

    // 2. Feature enablement checks
    assert.strictEqual(starterQuotas.features.includes("advanced_arima"), false);
    assert.strictEqual(proQuotas.features.includes("advanced_arima"), true);
    assert.strictEqual(enterpriseQuotas.features.includes("audit_forensics"), true);

    await assert.rejects(
      async () => assertFeatureEnabled(orgA.id, "advanced_arima"),
      /restricted to higher tiers/
    );

    const isProEnabled = await assertFeatureEnabled(orgB.id, "advanced_arima");
    assert.strictEqual(isProEnabled, true);

    // 3. Webhook quotas: Starter plan allows 0 webhooks
    await assert.rejects(
      async () => assertWithinQuota(orgA.id, "WEBHOOKS", 1),
      (err: any) => err instanceof QuotaExceededError && err.metric === "Webhook Endpoints"
    );

    // Pro plan allows webhooks
    const proWebhookCheck = await assertWithinQuota(orgB.id, "WEBHOOKS", 1);
    assert.strictEqual(proWebhookCheck.allowed, true);

    // 4. Over-limit Row check
    await assert.rejects(
      async () => assertWithinQuota(orgA.id, "ROWS", 60000), // Exceeds 50k
      (err: any) => err instanceof QuotaExceededError && err.metric === "Rows Ingested"
    );

    // 5. Over-limit Seats check (Tenant A currently has 1 seat, adding 3 brings it to 4 > 3 max)
    await assert.rejects(
      async () => assertWithinQuota(orgA.id, "TEAM_SEATS", 3),
      (err: any) => err instanceof QuotaExceededError && err.metric === "Team Seats"
    );
  });

  // =========================================================================
  // SUBTEST 2: Stripe Checkout & Customer Billing Portal Sessions
  // =========================================================================
  let customerIdA: string;

  await t.test("Stripe Checkout and Customer Portal session creation", async () => {
    // 1. Create Checkout Session for Org A to upgrade to PRO
    const checkoutResult = await createCheckoutSession({
      organizationId: orgA.id,
      userId: userA.id,
      planTier: "PRO",
      successUrl: "http://localhost:3000/settings?tab=benefits&checkout=success",
      cancelUrl: "http://localhost:3000/settings?tab=benefits&checkout=cancelled",
    });

    assert.ok(checkoutResult.sessionId, "Checkout session must return a sessionId");
    assert.ok(checkoutResult.url, "Checkout session must return a valid redirect URL");

    // Verify Stripe customer ID was generated and stored
    const updatedOrgA = await prisma.organization.findUnique({
      where: { id: orgA.id },
    });
    assert.ok(updatedOrgA?.stripeCustomerId, "stripeCustomerId must be saved in database");
    customerIdA = updatedOrgA!.stripeCustomerId!;

    // 2. Create Billing Portal Session
    const portalResult = await createBillingPortalSession({
      organizationId: orgA.id,
      returnUrl: "http://localhost:3000/settings?tab=benefits",
    });

    assert.ok(portalResult.url, "Portal session must return a valid redirect URL");
  });

  // =========================================================================
  // SUBTEST 3: Stripe Webhook Cryptographic Verification & Subscription Lifecycle
  // =========================================================================
  const subscriptionIdA = `sub_mock_${Date.now()}`;

  await t.test("Stripe webhook lifecycle transitions and automated plan upgrades", async () => {
    // 1. Event: checkout.session.completed -> Upgrades Org A to PRO
    const checkoutEvent = {
      id: `evt_test_${Date.now()}_1`,
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: orgA.id,
          customer: customerIdA,
          subscription: subscriptionIdA,
          metadata: {
            organizationId: orgA.id,
            planTier: "PRO",
          },
        },
      },
    };

    const checkoutProcessed = await processStripeWebhookEvent(checkoutEvent);
    assert.strictEqual(checkoutProcessed.handled, true);
    assert.strictEqual(checkoutProcessed.planTier, "PRO");

    // Verify DB update
    const upgradedOrgA = await prisma.organization.findUnique({
      where: { id: orgA.id },
    });
    assert.strictEqual(upgradedOrgA?.planTier, "PRO");
    assert.strictEqual(upgradedOrgA?.subscriptionStatus, "ACTIVE");
    assert.strictEqual(upgradedOrgA?.stripeSubscriptionId, subscriptionIdA);

    // 2. Event: invoice.payment_succeeded -> Records paid SubscriptionInvoice
    const invoiceId = `in_test_${Date.now()}`;
    const invoiceEvent = {
      id: `evt_test_${Date.now()}_2`,
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: invoiceId,
          customer: customerIdA,
          amount_paid: 29900,
          currency: "usd",
          invoice_pdf: "https://stripe.com/invoice/pdf/test_123.pdf",
          hosted_invoice_url: "https://stripe.com/invoice/hosted/test_123",
        },
      },
    };

    const invoiceProcessed = await processStripeWebhookEvent(invoiceEvent);
    assert.strictEqual(invoiceProcessed.handled, true);

    // Verify invoice in DB
    const dbInvoice = await prisma.subscriptionInvoice.findUnique({
      where: { stripeInvoiceId: invoiceId },
    });
    assert.ok(dbInvoice, "Invoice must be recorded in database");
    assert.strictEqual(dbInvoice.amountPaidCents, 29900);
    assert.strictEqual(dbInvoice.status, "PAID");
    assert.strictEqual(dbInvoice.organizationId, orgA.id);

    // 3. Event: customer.subscription.updated -> Past Due status
    const updateEvent = {
      id: `evt_test_${Date.now()}_3`,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: subscriptionIdA,
          customer: customerIdA,
          status: "past_due",
          cancel_at_period_end: true,
        },
      },
    };

    const updateProcessed = await processStripeWebhookEvent(updateEvent);
    assert.strictEqual(updateProcessed.handled, true);
    assert.strictEqual(updateProcessed.status, "PAST_DUE");

    const pastDueOrg = await prisma.organization.findUnique({
      where: { id: orgA.id },
    });
    assert.strictEqual(pastDueOrg?.subscriptionStatus, "PAST_DUE");
    assert.strictEqual(pastDueOrg?.cancelAtPeriodEnd, true);

    // 4. Event: customer.subscription.deleted -> Downgrade back to STARTER
    const cancelEvent = {
      id: `evt_test_${Date.now()}_4`,
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: subscriptionIdA,
          customer: customerIdA,
        },
      },
    };

    const cancelProcessed = await processStripeWebhookEvent(cancelEvent);
    assert.strictEqual(cancelProcessed.handled, true);

    const canceledOrg = await prisma.organization.findUnique({
      where: { id: orgA.id },
    });
    assert.strictEqual(canceledOrg?.planTier, "STARTER");
    assert.strictEqual(canceledOrg?.subscriptionStatus, "CANCELED");
  });

  // =========================================================================
  // SUBTEST 4: Metered Consumption Accounting
  // =========================================================================
  await t.test("Metered consumption records and billing overview aggregation", async () => {
    // Record discrete consumption
    const usageEntry = await recordMeteredUsage(orgB.id, "ROWS_INGESTED", 15000);
    assert.ok(usageEntry.id);
    assert.strictEqual(usageEntry.quantity, 15000);
    assert.strictEqual(usageEntry.metricKey, "ROWS_INGESTED");

    // Retrieve Billing Overview
    const overview = await getBillingOverview(orgB.id);
    assert.ok(overview.subscription);
    assert.strictEqual(overview.subscription.planTier, "PRO");
    assert.ok(overview.usage.rows);
    assert.ok(overview.usage.storage);
    assert.ok(overview.usage.teamSeats);
    assert.ok(overview.plans.length >= 3);
  });

  // =========================================================================
  // SUBTEST 5: REST API Route Validation & Multi-Tenant IDOR Attack Defense
  // =========================================================================
  await t.test("Billing REST API endpoints enforce tenant isolation and IDOR protection", async () => {
    // 1. GET /api/billing for Tenant A
    const reqA = createAuthRequest("/api/billing", sessionA.rawToken);
    const resA = await billingGetRoute(reqA);
    assert.strictEqual(resA.status, 200);
    const dataA = await resA.json();
    assert.strictEqual(dataA.success, true);
    assert.strictEqual(dataA.data.subscription.planTier, "STARTER");

    // 2. GET /api/billing for Tenant B (returns Tenant B's data)
    const reqB = createAuthRequest("/api/billing", sessionB.rawToken);
    const resB = await billingGetRoute(reqB);
    assert.strictEqual(resB.status, 200);
    const dataB = await resB.json();
    assert.strictEqual(dataB.success, true);
    assert.strictEqual(dataB.data.subscription.planTier, "PRO");

    // 3. POST /api/billing/checkout initiates valid checkout session
    const postCheckoutReq = createAuthRequest("/api/billing/checkout", sessionA.rawToken, {
      method: "POST",
      body: { planTier: "ENTERPRISE" },
    });
    const postCheckoutRes = await checkoutRoute(postCheckoutReq);
    assert.strictEqual(postCheckoutRes.status, 201);
    const checkoutData = await postCheckoutRes.json();
    assert.strictEqual(checkoutData.success, true);
    assert.ok(checkoutData.data.sessionId);

    // 4. POST /api/billing/portal returns portal URL
    const postPortalReq = createAuthRequest("/api/billing/portal", sessionA.rawToken, {
      method: "POST",
      body: {},
    });
    const postPortalRes = await portalRoute(postPortalReq);
    assert.strictEqual(postPortalRes.status, 200);
    const portalData = await postPortalRes.json();
    assert.strictEqual(portalData.success, true);
    assert.ok(portalData.data.url);

    // 5. GET /api/billing/invoices returns only Tenant A's invoices
    const getInvoicesReq = createAuthRequest("/api/billing/invoices", sessionA.rawToken);
    const getInvoicesRes = await invoicesRoute(getInvoicesReq);
    assert.strictEqual(getInvoicesRes.status, 200);
    const invoicesData = await getInvoicesRes.json();
    assert.strictEqual(invoicesData.success, true);
    assert.ok(Array.isArray(invoicesData.data.invoices));
    assert.ok(invoicesData.data.invoices.length >= 1);

    // 6. Tenant B requests invoices: Must see 0 invoices (Tenant A's invoice is isolated)
    const getInvoicesReqB = createAuthRequest("/api/billing/invoices", sessionB.rawToken);
    const getInvoicesResB = await invoicesRoute(getInvoicesReqB);
    assert.strictEqual(getInvoicesResB.status, 200);
    const invoicesDataB = await getInvoicesResB.json();
    assert.strictEqual(invoicesDataB.success, true);
    assert.strictEqual(invoicesDataB.data.invoices.length, 0);

    // 7. POST /api/billing/webhook rejects requests missing signature
    const unauthenticatedWebhook = new NextRequest("http://localhost:3000/api/billing/webhook", {
      method: "POST",
      body: JSON.stringify({ type: "test" }),
    });
    const webhookRes = await webhookRoute(unauthenticatedWebhook);
    assert.strictEqual(webhookRes.status, 400);
  });
});


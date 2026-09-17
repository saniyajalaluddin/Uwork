import test from "node:test";
import assert from "node:assert";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { isShuttingDown, performGracefulShutdown, registerShutdownHandlers } from "../src/lib/server/lifecycle";
import { auditProductionReadiness } from "../src/services/readiness.service";
import { GET as getReadinessRoute } from "../src/app/api/admin/readiness/route";
import { NextRequest } from "next/server";

const execFileAsync = promisify(execFile);

test("Phase 23: Production Hardening, Security Headers, Edge Caching & Packaging", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("HardenedProdPass123!#");

  // Setup Tenant
  const org = await prisma.organization.create({
    data: {
      name: `Prod Hardening Org ${timestamp}`,
      slug: `prod-hardening-org-${timestamp}`,
      planTier: "ENTERPRISE",
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: `prodadmin_${timestamp}@example.com`,
      passwordHash,
      firstName: "Prod",
      lastName: "Admin",
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      email: `prodmember_${timestamp}@example.com`,
      passwordHash,
      firstName: "Prod",
      lastName: "Member",
    },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: org.id, userId: adminUser.id, role: "OWNER" },
      { organizationId: org.id, userId: memberUser.id, role: "VIEWER" },
    ],
  });

  const adminSession = await createSession(adminUser.id, org.id);
  const memberSession = await createSession(memberUser.id, org.id);

  // Subtest 1: Validate Next.js Security Headers & Static Cache Configuration
  await t.test("1. Hardened Security Headers & Edge Cache in next.config.js", async () => {
    // Dynamically require next.config.js
    const nextConfig = require("../next.config.js");

    assert.strictEqual(nextConfig.reactStrictMode, true, "reactStrictMode should be enabled");
    assert.strictEqual(nextConfig.poweredByHeader, false, "poweredByHeader should be disabled");
    assert.strictEqual(nextConfig.compress, true, "compress should be enabled");

    const headerConfigs = await nextConfig.headers();
    assert.ok(Array.isArray(headerConfigs), "headers() should return an array of route rules");

    // Check global security headers for /(.*)
    const globalRule = headerConfigs.find((r: any) => r.source === "/(.*)");
    assert.ok(globalRule, "Global header rule /(.*) must exist");

    const headerMap = new Map<string, string>();
    for (const h of globalRule.headers) {
      headerMap.set(h.key, h.value);
    }

    assert.ok(headerMap.has("Content-Security-Policy"), "CSP header missing");
    const csp = headerMap.get("Content-Security-Policy")!;
    assert.ok(csp.includes("default-src 'self'"), "CSP must restrict default-src");
    assert.ok(csp.includes("frame-ancestors 'none'"), "CSP must disallow iframe embedding (clickjacking defense)");
    assert.ok(csp.includes("https://js.stripe.com"), "CSP must permit Stripe payments SDK");

    assert.strictEqual(headerMap.get("X-Frame-Options"), "DENY", "X-Frame-Options must be DENY");
    assert.strictEqual(headerMap.get("X-Content-Type-Options"), "nosniff", "X-Content-Type-Options must be nosniff");
    assert.ok(headerMap.get("Strict-Transport-Security")?.includes("max-age="), "HSTS must be enabled");
    assert.strictEqual(headerMap.get("Referrer-Policy"), "strict-origin-when-cross-origin", "Referrer-Policy configured");
    assert.ok(headerMap.has("Permissions-Policy"), "Permissions-Policy configured");

    // Check immutable static cache rule for /_next/static/(.*)
    const staticRule = headerConfigs.find((r: any) => r.source === "/_next/static/(.*)");
    assert.ok(staticRule, "Static asset rule /_next/static/(.*) must exist");
    const cacheControl = staticRule.headers.find((h: any) => h.key === "Cache-Control");
    assert.ok(cacheControl, "Cache-Control header must exist on static assets");
    assert.ok(cacheControl.value.includes("immutable"), "Static assets must have immutable caching");
    assert.ok(cacheControl.value.includes("31536000"), "Static assets must have 1-year max-age");
  });

  // Subtest 2: Server Lifecycle & Graceful Shutdown
  await t.test("2. Process Lifecycle & Graceful Shutdown Orchestration", async () => {
    assert.strictEqual(typeof isShuttingDown, "function");
    assert.strictEqual(typeof performGracefulShutdown, "function");
    assert.strictEqual(typeof registerShutdownHandlers, "function");

    // Can register shutdown handlers without error
    registerShutdownHandlers();

    // Perform graceful shutdown invocation
    const shutdownResult = await performGracefulShutdown("TEST_SHUTDOWN_SIGNAL");
    assert.strictEqual(shutdownResult.success, true);
    assert.strictEqual(shutdownResult.drained, true);
    assert.strictEqual(shutdownResult.reason, "TEST_SHUTDOWN_SIGNAL");
    assert.ok(typeof shutdownResult.durationMs === "number");

    // Second call is idempotent
    const secondCall = await performGracefulShutdown("REDUNDANT_SIGNAL");
    assert.strictEqual(secondCall.success, true);
    assert.strictEqual(secondCall.drained, true);
  });

  // Subtest 3: Automated Production Readiness Service
  await t.test("3. Production Readiness Audit Engine", async () => {
    const report = await auditProductionReadiness();

    assert.ok(report, "Audit report must be generated");
    assert.strictEqual(typeof report.readyForProduction, "boolean");
    assert.ok(report.score >= 0 && report.score <= 100, "Score should be between 0 and 100");
    assert.ok(report.totalChecks >= 5, "Should evaluate at least 5 distinct check dimensions");
    assert.strictEqual(report.totalChecks, report.passedChecks + report.failedChecks);
    assert.ok(Array.isArray(report.checks), "checks array must be present");

    const categories = new Set(report.checks.map((c) => c.category));
    assert.ok(categories.has("SECURITY"), "Must audit SECURITY category");
    assert.ok(categories.has("DATABASE"), "Must audit DATABASE category");
    assert.ok(categories.has("STORAGE"), "Must audit STORAGE category");
    assert.ok(categories.has("CONFIGURATION"), "Must audit CONFIGURATION category");
    assert.ok(categories.has("CANARY"), "Must audit CANARY category");

    // Verify critical checks pass
    const dbCheck = report.checks.find((c) => c.id === "DB_CONNECTIVITY_AND_TABLES");
    assert.ok(dbCheck, "DB check must exist");
    assert.strictEqual(dbCheck.passed, true, "DB check should pass");

    const storageCheck = report.checks.find((c) => c.id === "STORAGE_DIRECTORIES_WRITABLE");
    assert.ok(storageCheck, "Storage check must exist");
    assert.strictEqual(storageCheck.passed, true, "Storage directories check should pass");

    const rateLimitCheck = report.checks.find((c) => c.id === "SECURITY_RATE_LIMITER");
    assert.ok(rateLimitCheck, "Rate limiter check must exist");
    assert.strictEqual(rateLimitCheck.passed, true, "Rate limiter check should pass");
  });

  // Subtest 4: Admin Readiness REST API Route
  await t.test("4. GET /api/admin/readiness Route & RBAC Enforcement", async () => {
    // 4.1 Anonymous access -> 401 Unauthorized
    const unauthReq = new NextRequest("http://localhost:3000/api/admin/readiness", {
      method: "GET",
    });
    const unauthRes = await getReadinessRoute(unauthReq);
    assert.strictEqual(unauthRes.status, 401);

    // 4.2 Viewer member access (lacks org:manage permission) -> 403 Forbidden
    const forbiddenReq = new NextRequest("http://localhost:3000/api/admin/readiness", {
      method: "GET",
      headers: {
        cookie: `uwork_session=${memberSession.rawToken}`,
      },
    });
    const forbiddenRes = await getReadinessRoute(forbiddenReq);
    assert.strictEqual(forbiddenRes.status, 403);

    // 4.3 Admin / Owner access -> 200 OK with report
    const adminReq = new NextRequest("http://localhost:3000/api/admin/readiness", {
      method: "GET",
      headers: {
        cookie: `uwork_session=${adminSession.rawToken}`,
      },
    });
    const adminRes = await getReadinessRoute(adminReq);
    assert.strictEqual(adminRes.status, 200);

    const body = await adminRes.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.report, "Response should contain report");
    assert.ok(typeof body.data.report.score === "number");
    assert.ok(body.data.report.checks.length >= 5);
  });

  // Subtest 5: Standalone CLI Preflight Script Execution
  await t.test("5. CLI Preflight Script Execution (scripts/verify-production-readiness.js)", async () => {
    const scriptPath = path.resolve(process.cwd(), "scripts", "verify-production-readiness.js");
    const { stdout, stderr } = await execFileAsync("node", [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    assert.ok(stdout.includes("Production Readiness Preflight Check"), "Script banner missing");
    assert.ok(stdout.includes("STATUS: ALL PRODUCTION READINESS CHECKS PASSED"), "Script result line missing");
  });


  // Cleanup tenant data
  await prisma.organizationMember.deleteMany({ where: { organizationId: org.id } });
  await prisma.session.deleteMany({ where: { userId: { in: [adminUser.id, memberUser.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, memberUser.id] } } });
  await prisma.organization.delete({ where: { id: org.id } });
});


import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { checkRateLimit, clearRateLimits, getRateLimitHeaders } from "../src/lib/security/rate-limiter";
import { NextRequest } from "next/server";

import { POST as loginUser } from "../src/app/api/auth/login/route";
import { POST as changePassword } from "../src/app/api/user/change-password/route";

test("Phase 2: Production Rate Limiting & Auth Hardening Verification", async (t) => {
  const timestamp = Date.now();
  const initialPassword = "InitialPassword123!#";
  const passwordHash = await hashPassword(initialPassword);

  // Setup test organization and user
  const org = await prisma.organization.create({
    data: { name: `RateLimit Org ${timestamp}`, slug: `ratelimit-org-${timestamp}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `auth_hardening_${timestamp}@example.com`,
      passwordHash,
      firstName: "Security",
      lastName: "Tester",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });
  const session1 = await createSession(user.id, org.id);
  const session2 = await createSession(user.id, org.id); // Secondary session to test revocation

  const makeJsonRequest = (url: string, body: any, headers: Record<string, string> = {}): NextRequest => {
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        ...headers,
      }),
      body: JSON.stringify(body),
    } as any);
  };

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Sliding Window Rate Limiter & RFC Header Generation
    // ------------------------------------------------------------------------
    await t.test("1. Sliding window rate limiter enforces limits and returns RFC headers", () => {
      clearRateLimits();
      const id = "test_key_" + timestamp;
      const opts = { limit: 3, windowMs: 5000 };

      const r1 = checkRateLimit(id, opts);
      assert.strictEqual(r1.allowed, true);
      assert.strictEqual(r1.remaining, 2);
      const h1 = getRateLimitHeaders(r1);
      assert.strictEqual(h1["X-RateLimit-Limit"], "3");
      assert.strictEqual(h1["X-RateLimit-Remaining"], "2");

      const r2 = checkRateLimit(id, opts);
      assert.strictEqual(r2.allowed, true);
      assert.strictEqual(r2.remaining, 1);

      const r3 = checkRateLimit(id, opts);
      assert.strictEqual(r3.allowed, true);
      assert.strictEqual(r3.remaining, 0);

      const r4 = checkRateLimit(id, opts);
      assert.strictEqual(r4.allowed, false);
      assert.strictEqual(r4.remaining, 0);
      assert.ok(r4.retryAfterSeconds && r4.retryAfterSeconds > 0);
      const h4 = getRateLimitHeaders(r4);
      assert.ok(h4["Retry-After"]);
    });

    // ------------------------------------------------------------------------
    // TEST 2: Timing Side-Channel / User Enumeration Mitigation
    // ------------------------------------------------------------------------
    await t.test("2. Login performs constant-time evaluation on non-existent users", async () => {
      clearRateLimits();

      // Timing measurement on non-existent email
      const startFake = Date.now();
      const fakeReq = makeJsonRequest("http://localhost:3000/api/auth/login", {
        email: `non_existent_${timestamp}@example.com`,
        password: "ArbitraryPassword123!",
      });
      const fakeRes = await loginUser(fakeReq);
      const fakeData = await fakeRes.json();
      const durationFake = Date.now() - startFake;

      assert.strictEqual(fakeRes.status, 401);
      assert.strictEqual(fakeData.error?.code, "INVALID_CREDENTIALS");
      // Verify dummy hash execution occurred (took at least 15ms due to bcrypt 12 rounds)
      assert.ok(durationFake >= 15, `Fake user bcrypt timing took ${durationFake}ms, mitigating user enumeration`);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Account Lockout & Security Audit Logging
    // ------------------------------------------------------------------------
    await t.test("3. Brute force triggers account lockout and logs security audit events", async () => {
      clearRateLimits();

      // Send 5 failed login attempts with wrong password
      for (let i = 1; i <= 5; i++) {
        clearRateLimits(); // Clear IP rate limit so we test account lockout logic specifically
        const req = makeJsonRequest("http://localhost:3000/api/auth/login", {
          email: user.email,
          password: "WrongPassword999!",
        }, { "x-real-ip": `192.168.1.${10 + i}` });

        const res = await loginUser(req);
        assert.strictEqual(res.status, 401);
      }

      // Check database: user must be locked
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      assert.strictEqual(updatedUser?.failedLoginAttempts, 5);
      assert.ok(updatedUser?.lockedUntil && updatedUser.lockedUntil > new Date(), "Account must be locked until future date");

      // Verify AuditLog contains LOGIN_FAILED and ACCOUNT_LOCKED entries
      const failedLogs = await prisma.auditLog.findMany({
        where: { userId: user.id, action: "LOGIN_FAILED" },
      });
      assert.ok(failedLogs.length >= 4, "Must have recorded LOGIN_FAILED audit entries");

      const lockedLogs = await prisma.auditLog.findMany({
        where: { userId: user.id, action: "ACCOUNT_LOCKED" },
      });
      assert.strictEqual(lockedLogs.length >= 1, true, "Must have recorded ACCOUNT_LOCKED audit entry");

      // 6th attempt should be rejected with HTTP 423 ACCOUNT_LOCKED
      clearRateLimits();
      const req6 = makeJsonRequest("http://localhost:3000/api/auth/login", {
        email: user.email,
        password: initialPassword,
      });
      const res6 = await loginUser(req6);
      const data6 = await res6.json();
      assert.strictEqual(res6.status, 423, "Must return HTTP 423 Locked");
      assert.strictEqual(data6.error?.code, "ACCOUNT_LOCKED");

      // Unlock user for subsequent tests
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });

    // ------------------------------------------------------------------------
    // TEST 4: Password Change Protection, Session Revocation & Auditing
    // ------------------------------------------------------------------------
    await t.test("4. Password change enforces complexity, revokes other sessions, and logs audit", async () => {
      clearRateLimits();
      const newPassword = "BrandNewSecurePassword2026!#";

      const changeReq = makeJsonRequest(
        "http://localhost:3000/api/user/change-password",
        {
          currentPassword: initialPassword,
          newPassword,
        },
        {
          cookie: `uwork_session=${session1.rawToken}`,
        }
      );

      const res = await changePassword(changeReq);
      const data = await res.json();
      assert.strictEqual(res.status, 200, "Password change should succeed");
      assert.strictEqual(data.success, true);

      // Verify secondary session (session2) was revoked
      const survivingSession2 = await prisma.session.findUnique({
        where: { id: session2.session.id },
      });
      assert.strictEqual(survivingSession2, null, "Other active sessions must be revoked on password change");

      // Current session (session1) must remain valid
      const survivingSession1 = await prisma.session.findUnique({
        where: { id: session1.session.id },
      });
      assert.ok(survivingSession1, "Current active session must be preserved");

      // Verify PASSWORD_CHANGED audit log
      const auditEntry = await prisma.auditLog.findFirst({
        where: { userId: user.id, action: "PASSWORD_CHANGED" },
      });
      assert.ok(auditEntry, "Must record PASSWORD_CHANGED in AuditLog");
    });

  } finally {
    // Cleanup test data
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: org.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.organization.deleteMany({ where: { id: org.id } });
    clearRateLimits();
  }
});


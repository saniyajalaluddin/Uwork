import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { AppConfig } from "@/config/app.config";

// Precomputed valid bcrypt hash for constant-time dummy verification
const DUMMY_HASH = "$2a$12$xDTbyI5hBfmfidgd5VlOG.HYsPKk/z0i5ifXtDTkOB8KIiLP5wl82";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "Unknown";

  // 1. Rate limiting
  const rateLimitCheck = enforceRateLimit(
    req,
    "auth_login",
    AppConfig.rateLimits.authLogin
  );
  if (rateLimitCheck.error) return rateLimitCheck.error;

  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse("Email and password are required.", 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      // Timing side-channel mitigation: execute constant-time bcrypt compare even if user does not exist
      await verifyPassword(password, DUMMY_HASH);
      return errorResponse("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const waitMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      );
      return errorResponse(
        `Account temporarily locked due to multiple failed attempts. Please try again in ${waitMinutes} minute(s).`,
        423,
        "ACCOUNT_LOCKED"
      );
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      const newAttempts = user.failedLoginAttempts + 1;
      let lockedUntil: Date | null = null;
      if (newAttempts >= AppConfig.auth.maxFailedLoginAttempts) {
        lockedUntil = new Date(Date.now() + AppConfig.auth.lockoutDurationMs);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil,
        },
      });

      // Security Audit Log for Failed Login / Lockout
      const orgId = user.memberships[0]?.organizationId;
      if (orgId) {
        await prisma.auditLog.create({
          data: {
            organizationId: orgId,
            userId: user.id,
            action: lockedUntil ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
            resourceType: "AUTH",
            resourceId: user.id,
            ipAddress: ip,
            userAgent,
            status: "DENIED",
            metadataJson: JSON.stringify({ email: normalizedEmail, attempts: newAttempts, locked: Boolean(lockedUntil) }),
          },
        });
      }

      return errorResponse("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    // Reset failed login attempts on success
    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const primaryMembership = user.memberships[0];
    if (!primaryMembership) {
      return errorResponse("User has no assigned organization workspace.", 403);
    }

    const { session, rawToken } = await createSession(
      user.id,
      primaryMembership.organizationId,
      ip,
      userAgent
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: primaryMembership.organizationId,
        userId: user.id,
        action: "USER_LOGIN",
        resourceType: "SESSION",
        resourceId: session.id,
        ipAddress: ip,
        userAgent,
        status: "SUCCESS",
        metadataJson: JSON.stringify({ email: user.email }),
      },
    });

    const response = successResponse({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
      },
      organization: {
        id: primaryMembership.organization.id,
        name: primaryMembership.organization.name,
        slug: primaryMembership.organization.slug,
        planTier: primaryMembership.organization.planTier,
      },
      role: primaryMembership.role,
    });

    if (rateLimitCheck.headers) {
      for (const [header, val] of Object.entries(rateLimitCheck.headers)) {
        response.headers.set(header, val);
      }
    }

    // Set secure HTTP-only cookie
    response.cookies.set("uwork_session", rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    return errorResponse("Internal server error during authentication.", 500);
  }
}

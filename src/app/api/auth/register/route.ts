import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const rateLimitCheck = enforceRateLimit(req, "auth_register", {
    limit: 5,
    windowMs: 3600000, // 1 hour
  });
  if (rateLimitCheck.error) return rateLimitCheck.error;

  try {
    const body = await req.json();
    const { email, password, firstName, lastName, organizationName } = body;

    if (!email || !password || !firstName || !lastName || !organizationName) {
      return errorResponse("All fields are required.", 400);
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return errorResponse(passwordValidation.message!, 400, "WEAK_PASSWORD");
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return errorResponse("An account with this email already exists.", 409, "USER_EXISTS");
    }

    const passwordHash = await hashPassword(password);
    const slug = organizationName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Create user and organization atomically
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          emailVerifiedAt: new Date(),
        },
      });

      const org = await tx.organization.create({
        data: {
          name: organizationName.trim(),
          slug: `${slug}-${Date.now().toString().slice(-4)}`,
          planTier: "PROFESSIONAL",
        },
      });

      const member = await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      return { user, org, member };
    });

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "Unknown";

    const { session, rawToken } = await createSession(
      result.user.id,
      result.org.id,
      ip,
      userAgent
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: result.org.id,
        userId: result.user.id,
        action: "USER_REGISTERED",
        resourceType: "USER",
        resourceId: result.user.id,
        ipAddress: ip,
        userAgent,
        status: "SUCCESS",
        metadataJson: JSON.stringify({ email: result.user.email, orgName: result.org.name }),
      },
    });

    const response = successResponse({
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
        planTier: result.org.planTier,
      },
      role: result.member.role,
    });

    response.cookies.set("uwork_session", rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    return errorResponse("Failed to register account.", 500);
  }
}


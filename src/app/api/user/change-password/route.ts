import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, enforceRateLimit } from "@/lib/api/middleware";
import { verifyPassword, hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { successResponse, errorResponse } from "@/lib/api/response";
import { AppConfig } from "@/config/app.config";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  // Rate limit password change attempts per user
  const rateLimitCheck = enforceRateLimit(
    req,
    "auth_change_password",
    AppConfig.rateLimits.passwordChange,
    auth.context.user.id
  );
  if (rateLimitCheck.error) return rateLimitCheck.error;

  try {
    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return errorResponse("Current password and new password are required.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.context.user.id },
    });

    if (!user) return errorResponse("User not found.", 404);

    // Verify current password
    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      await prisma.auditLog.create({
        data: {
          organizationId: auth.context.organization.id,
          userId: user.id,
          action: "PASSWORD_CHANGE_FAILED",
          resourceType: "USER",
          resourceId: user.id,
          status: "DENIED",
          metadataJson: JSON.stringify({ reason: "INVALID_CURRENT_PASSWORD" }),
        },
      });

      return errorResponse("The current password provided is incorrect.", 400, "INVALID_CURRENT_PASSWORD");
    }

    // Validate new password complexity
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return errorResponse(validation.message!, 400, "WEAK_PASSWORD");
    }

    // Check not same
    const isSame = await verifyPassword(newPassword, user.passwordHash);
    if (isSame) {
      return errorResponse("New password cannot be identical to your current password.", 400);
    }

    const newHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // Invalidate other sessions for security except the current session
    await prisma.session.deleteMany({
      where: {
        userId: user.id,
        id: { not: auth.context.sessionId },
      },
    });

    // Security Audit Log
    await prisma.auditLog.create({
      data: {
        organizationId: auth.context.organization.id,
        userId: user.id,
        action: "PASSWORD_CHANGED",
        resourceType: "USER",
        resourceId: user.id,
        status: "SUCCESS",
        metadataJson: JSON.stringify({ email: user.email }),
      },
    });

    const response = successResponse({ message: "Password updated successfully. Other active sessions revoked." });
    if (rateLimitCheck.headers) {
      for (const [h, v] of Object.entries(rateLimitCheck.headers)) {
        response.headers.set(h, v);
      }
    }
    return response;
  } catch (err: any) {
    return errorResponse("Failed to change password.", 500);
  }
}

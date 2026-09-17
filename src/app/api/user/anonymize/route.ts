import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, enforceRateLimit } from "@/lib/api/middleware";
import { verifyPassword } from "@/lib/auth/password";
import { successResponse, errorResponse } from "@/lib/api/response";
import { anonymizeUserAccount } from "@/services/compliance.service";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const userId = auth.context.user.id;

  // Rate limit account anonymization attempts per user
  const rateLimitCheck = enforceRateLimit(
    req,
    "user_anonymize",
    { limit: 5, windowMs: 15 * 60 * 1000 },
    userId
  );
  if (rateLimitCheck.error) return rateLimitCheck.error;

  try {
    const body = await req.json();
    const { password, confirmation } = body;

    if (!password) {
      return errorResponse("Current password is required to verify account deletion.", 400);
    }

    if (confirmation !== "DELETE MY ACCOUNT") {
      return errorResponse("Confirmation text must exactly match 'DELETE MY ACCOUNT'.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return errorResponse("User account not found.", 404);
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return errorResponse("Invalid password. Anonymization request denied.", 400, "INVALID_PASSWORD");
    }

    // Execute GDPR Art. 17 erasure
    const result = await anonymizeUserAccount(userId, userId);

    const response = successResponse({
      message: "Your account has been permanently anonymized and all sessions revoked under GDPR Art. 17.",
      result,
    });

    // Clear session cookie
    response.cookies.set("uwork_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err: any) {
    return errorResponse(err.message || "Failed to anonymize user account.", 400);
  }
}


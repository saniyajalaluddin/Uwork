import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const sessions = await prisma.session.findMany({
    where: { userId: auth.context.user.id },
    orderBy: { createdAt: "desc" },
  });

  const formatted = sessions.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress || "127.0.0.1",
    userAgent: s.userAgent || "Web Browser",
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    isCurrent: s.id === auth.context.sessionId,
  }));

  return successResponse({ sessions: formatted });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("id");

  if (sessionId) {
    if (sessionId === auth.context.sessionId) {
      return errorResponse("Cannot revoke current active session from here. Use Logout instead.", 400);
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId: auth.context.user.id,
      },
    });

    if (!session) {
      return errorResponse("Session not found.", 404);
    }

    await prisma.session.delete({ where: { id: session.id } });
    return successResponse({ message: "Session revoked." });
  } else {
    // Revoke all other sessions
    await prisma.session.deleteMany({
      where: {
        userId: auth.context.user.id,
        id: { not: auth.context.sessionId },
      },
    });
    return successResponse({ message: "All other sessions revoked." });
  }
}


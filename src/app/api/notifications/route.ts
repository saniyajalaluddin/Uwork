import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const notifications = await prisma.notification.findMany({
    where: {
      organizationId: auth.context.organization.id,
      OR: [
        { userId: auth.context.user.id },
        { userId: null },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return successResponse({ notifications });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  await prisma.notification.updateMany({
    where: {
      organizationId: auth.context.organization.id,
      isRead: false,
      OR: [
        { userId: auth.context.user.id },
        { userId: null },
      ],
    },
    data: { isRead: true },
  });

  return successResponse({ message: "All notifications marked as read." });
}


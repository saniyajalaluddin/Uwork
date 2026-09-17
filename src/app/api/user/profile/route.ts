import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.context.user.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      isActive: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) return errorResponse("User not found.", 404);

  return successResponse({
    user,
    role: auth.context.role,
    organization: auth.context.organization,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { firstName, lastName, avatarUrl } = body;

    if (!firstName || !lastName) {
      return errorResponse("First name and last name are required.", 400);
    }

    const updated = await prisma.user.update({
      where: { id: auth.context.user.id },
      data: {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        avatarUrl: avatarUrl ? String(avatarUrl).trim() : null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: auth.context.organization.id,
        userId: auth.context.user.id,
        action: "PROFILE_UPDATED",
        resourceType: "USER",
        resourceId: auth.context.user.id,
        status: "SUCCESS",
        metadataJson: JSON.stringify({ name: `${updated.firstName} ${updated.lastName}` }),
      },
    });

    return successResponse({ user: updated });
  } catch (err: any) {
    return errorResponse("Failed to update user profile.", 500);
  }
}


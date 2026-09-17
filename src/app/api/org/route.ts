import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import {
  updateOrganizationDetails,
  deleteOrganizationSafe,
} from "@/services/organization.service";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
    },
  });

  if (!org) {
    return errorResponse("Organization not found.", 404);
  }

  const owners = org.members
    .filter((m) => m.role === "OWNER")
    .map((m) => ({
      userId: m.user.id,
      name: `${m.user.firstName} ${m.user.lastName}`,
      email: m.user.email,
    }));

  return successResponse({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      planTier: org.planTier,
      logoUrl: org.logoUrl,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      memberCount: org.members.length,
      owners,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const body = await req.json();
    const { name, slug, logoUrl } = body;

    const updated = await updateOrganizationDetails({
      organizationId: orgId,
      userId,
      name,
      slug,
      logoUrl,
    });

    return successResponse({
      organization: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        planTier: updated.planTier,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to update organization details.", 400);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "org:delete");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;
  const userRole = auth.context.role;

  try {
    const body = await req.json();
    const { confirmationSlug } = body;

    if (!confirmationSlug) {
      return errorResponse("confirmationSlug is required to confirm organization deletion.", 400);
    }

    const result = await deleteOrganizationSafe({
      organizationId: orgId,
      requestingUserId: userId,
      requestingUserRole: userRole,
      confirmationSlug,
    });

    return successResponse(result);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to delete organization.", 400);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "members:manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { role } = body;

    if (!["ADMIN", "ANALYST", "VIEWER", "OWNER"].includes(role)) {
      return errorResponse("Invalid role specified.", 400);
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!membership) {
      return errorResponse("Member not found in this organization.", 404);
    }

    // Prevent changing the last owner
    if (membership.role === "OWNER" && role !== "OWNER") {
      const ownerCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return errorResponse("Cannot demote the sole organization Owner.", 400);
      }
    }

    const updated = await prisma.organizationMember.update({
      where: { id: membership.id },
      data: { role },
      include: { user: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.context.user.id,
        action: "MEMBER_ROLE_UPDATED",
        resourceType: "MEMBER",
        resourceId: updated.id,
        status: "SUCCESS",
        metadataJson: JSON.stringify({ memberEmail: updated.user.email, newRole: role }),
      },
    });

    return successResponse({
      membershipId: updated.id,
      role: updated.role,
      name: `${updated.user.firstName} ${updated.user.lastName}`,
    });
  } catch (err: any) {
    return errorResponse("Failed to update member role.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "members:manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { id, organizationId: orgId },
      include: { user: true },
    });

    if (!membership) {
      return errorResponse("Member not found.", 404);
    }

    if (membership.role === "OWNER") {
      const ownerCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return errorResponse("Cannot remove the sole organization Owner.", 400);
      }
    }

    await prisma.organizationMember.delete({
      where: { id: membership.id },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: auth.context.user.id,
        action: "MEMBER_REMOVED",
        resourceType: "MEMBER",
        resourceId: membership.id,
        status: "SUCCESS",
        metadataJson: JSON.stringify({ removedEmail: membership.user.email }),
      },
    });

    return successResponse({ message: "Member removed from organization." });
  } catch (err: any) {
    return errorResponse("Failed to remove member.", 500);
  }
}


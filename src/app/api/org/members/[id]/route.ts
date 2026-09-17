import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import {
  updateMemberRoleSafe,
  removeMemberSafe,
} from "@/services/organization.service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "members:manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;
  const requestingUserId = auth.context.user.id;
  const requestingUserRole = auth.context.role;

  try {
    const body = await req.json();
    const { role } = body;

    if (!role) {
      return errorResponse("New role is required.", 400);
    }

    const updated = await updateMemberRoleSafe({
      organizationId: orgId,
      requestingUserId,
      requestingUserRole,
      targetMembershipId: id,
      newRole: role,
    });

    return successResponse({
      membershipId: updated.membershipId,
      role: updated.role,
      name: updated.name,
      email: updated.email,
    });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return errorResponse(err.message || "Failed to update member role.", status);
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
  const requestingUserId = auth.context.user.id;
  const requestingUserRole = auth.context.role;

  try {
    const result = await removeMemberSafe({
      organizationId: orgId,
      requestingUserId,
      requestingUserRole,
      targetMembershipId: id,
    });

    return successResponse({
      message: `Member ${result.removedEmail} removed from organization.`,
      ...result,
    });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return errorResponse(err.message || "Failed to remove member.", status);
  }
}

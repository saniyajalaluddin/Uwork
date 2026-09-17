import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from "@/services/organization.service";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "members:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const invitations = await listInvitations(orgId);
    return successResponse({ invitations });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch invitations.", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "members:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const body = await req.json();
    const { email, role = "ANALYST", expiresInDays = 7 } = body;

    if (!email) {
      return errorResponse("Recipient email address is required.", 400);
    }

    const result = await createInvitation({
      organizationId: orgId,
      email,
      role,
      invitedById: userId,
      expiresInDays,
    });

    return successResponse(result, 201);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to create invitation.", 400);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "members:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  const { searchParams } = new URL(req.url);
  const invitationId = searchParams.get("id");

  if (!invitationId) {
    return errorResponse("Invitation ID is required as query parameter '?id='.", 400);
  }

  try {
    const revoked = await revokeInvitation({
      organizationId: orgId,
      invitationId,
      userId,
    });

    return successResponse({
      message: "Invitation successfully revoked.",
      invitationId: revoked.id,
      status: revoked.status,
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to revoke invitation.", 400);
  }
}

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { acceptInvitation } from "@/services/organization.service";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const userId = auth.context.user.id;

  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return errorResponse("Invitation token is required.", 400);
    }

    const result = await acceptInvitation({
      rawToken: token,
      userId,
    });

    return successResponse({
      message: "Invitation accepted successfully. You have joined the organization.",
      membership: result,
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to accept invitation.", 400);
  }
}

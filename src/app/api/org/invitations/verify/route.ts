import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { verifyInvitation } from "@/services/organization.service";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return errorResponse("Invitation token is required.", 400);
  }

  try {
    const result = await verifyInvitation(token);
    if (!result.valid) {
      return errorResponse(`Invitation is invalid: ${result.reason || "EXPIRED"}`, 400);
    }

    return successResponse({ invitation: result });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to verify invitation.", 500);
  }
}


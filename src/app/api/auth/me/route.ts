import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult.error;

  const { context } = authResult;
  return successResponse({
    user: context.user,
    organization: context.organization,
    role: context.role,
  });
}


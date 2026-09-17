import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { executeScheduledDigests } from "@/services/report.service";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "reports:write");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const scheduleId = body.scheduleId;

    const results = await executeScheduledDigests(auth.context.organization.id, scheduleId);

    return successResponse({
      message: `Executed ${results.length} scheduled digest(s).`,
      results,
    });
  } catch (err: any) {
    console.error("Run schedule error:", err);
    return errorResponse("Failed to execute scheduled digests.", 500);
  }
}

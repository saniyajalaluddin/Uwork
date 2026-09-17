import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { cancelJob } from "@/services/job-queue.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "datasets:write");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;

  const result = await cancelJob(id, orgId);
  if (!result.success) {
    return errorResponse(result.error || "Failed to cancel job.", 400);
  }

  return successResponse({ message: "Job cancelled successfully." });
}
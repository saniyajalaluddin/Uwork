import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;

  const job = await prisma.job.findFirst({
    where: {
      id,
      organizationId: orgId,
    },
  });

  if (!job) {
    return errorResponse("Job not found in this organization.", 404);
  }

  let result = null;
  let errorDetails = null;
  try {
    if (job.resultJson) result = JSON.parse(job.resultJson);
  } catch {}
  try {
    if (job.errorDetailsJson) errorDetails = JSON.parse(job.errorDetailsJson);
  } catch {}

  return successResponse({
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    progressPct: job.progressPct,
    stepMessage: job.stepMessage,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    result,
    errorDetails,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
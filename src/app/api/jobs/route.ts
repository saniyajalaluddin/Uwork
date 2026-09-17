import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get("status") || undefined;
  const jobType = searchParams.get("jobType") || undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const skip = (page - 1) * limit;

  try {
    const where: any = { organizationId: orgId };
    if (status) where.status = status;
    if (jobType) where.jobType = jobType;

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        select: {
          id: true,
          jobType: true,
          status: true,
          progressPct: true,
          stepMessage: true,
          attempts: true,
          maxAttempts: true,
          createdAt: true,
          updatedAt: true,
          resultJson: true,
          errorDetailsJson: true,
        },
      }),
    ]);

    const formattedJobs = jobs.map((job) => {
      let result = null;
      let errorDetails = null;
      try {
        if (job.resultJson) result = JSON.parse(job.resultJson);
      } catch {}
      try {
        if (job.errorDetailsJson) errorDetails = JSON.parse(job.errorDetailsJson);
      } catch {}

      return {
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
      };
    });

    return successResponse({
      jobs: formattedJobs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to retrieve jobs", 500);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { enqueueJob, processNextJob } from "@/services/job-queue.service";
import "@/services/workers";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "datasets:write");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { datasetVersionId, operations = [], idempotencyKey } = body;

    if (!datasetVersionId || typeof datasetVersionId !== "string") {
      return errorResponse("Missing or invalid datasetVersionId.", 400);
    }

    if (!Array.isArray(operations)) {
      return errorResponse("Operations must be an array.", 400);
    }

    // Verify tenant boundary on the dataset
    const version = await prisma.datasetVersion.findFirst({
      where: {
        id: datasetVersionId,
        dataset: {
          organizationId: orgId,
        },
      },
    });

    if (!version) {
      return errorResponse("Dataset version not found in this organization.", 404);
    }

    // Enqueue the async job
    const job = await enqueueJob({
      organizationId: orgId,
      jobType: "DATA_CLEANING",
      payload: {
        datasetVersionId,
        operations,
        organizationId: orgId,
        userId: auth.context.user.id,
      },
      idempotencyKey,
    });

    // Trigger background execution asynchronously without blocking the event loop or response
    setImmediate(() => {
      processNextJob(undefined, { jobId: job.id }).catch((err) => {
        console.error("Background worker execution error:", err);
      });
    });

    return successResponse(
      {
        jobId: job.id,
        status: job.status,
        progressPct: job.progressPct,
        stepMessage: job.stepMessage,
        createdAt: job.createdAt,
      },
      202
    );
  } catch (err: any) {
    return errorResponse(err.message || "Failed to enqueue data cleaning job.", 500);
  }
}
import { prisma } from "../lib/db/prisma";
import crypto from "crypto";
import { AppConfig } from "../config/app.config";

export type JobType =
  | "FILE_INGESTION"
  | "DATA_PROFILING"
  | "FORECAST_RUN"
  | "REPORT_EXPORT"
  | "DATA_CLEANING";

export type JobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface EnqueueJobOptions {
  organizationId: string;
  jobType: JobType;
  payload: Record<string, any>;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export type JobHandler = (
  payload: Record<string, any>,
  updateProgress: (pct: number, msg: string) => Promise<void>,
  signal: { isCancelled: () => Promise<boolean> }
) => Promise<Record<string, any>>;

// Handler registry
const jobHandlers = new Map<string, JobHandler>();

export function registerJobHandler(jobType: JobType, handler: JobHandler): void {
  jobHandlers.set(jobType, handler);
}

/**
 * Enqueue a new background task
 */
export async function enqueueJob(options: EnqueueJobOptions) {
  const {
    organizationId,
    jobType,
    payload,
    idempotencyKey,
    maxAttempts = AppConfig.jobs.defaultMaxAttempts,
  } = options;

  if (idempotencyKey) {
    const existing = await prisma.job.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return existing;
    }
  }

  const job = await prisma.job.create({
    data: {
      organizationId,
      jobType,
      status: "QUEUED",
      progressPct: 0,
      stepMessage: "Job queued in scheduler",
      payloadJson: JSON.stringify(payload || {}),
      idempotencyKey: idempotencyKey || null,
      maxAttempts,
      attempts: 0,
    },
  });

  return job;
}

/**
 * Update real-time progress for a job
 */
export async function updateJobProgress(jobId: string, progressPct: number, stepMessage: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      progressPct: Math.min(100, Math.max(0, Math.round(progressPct))),
      stepMessage,
    },
  }).catch(() => {});
}

/**
 * Process the next pending job atomically with distributed lock
 */
export async function processNextJob(
  workerId: string = `worker_${process.pid}_${crypto.randomBytes(4).toString("hex")}`,
  filter?: { jobId?: string; organizationId?: string }
): Promise<{ processed: boolean; jobId?: string; status?: JobStatus; error?: string }> {
  const staleThreshold = new Date(Date.now() - AppConfig.jobs.staleLockThresholdMs);

  const baseWhere: any = {};
  if (filter?.jobId) {
    baseWhere.id = filter.jobId;
  } else if (filter?.organizationId) {
    baseWhere.organizationId = filter.organizationId;
  }

  // Find next candidate job
  const candidate = await prisma.job.findFirst({
    where: {
      ...baseWhere,
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", lockedAt: { lt: staleThreshold } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });


  if (!candidate) {
    return { processed: false };
  }

  // Atomically acquire lock
  const lockedJob = await prisma.job.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", lockedAt: { lt: staleThreshold } },
      ],
    },
    data: {
      status: "RUNNING",
      lockedBy: workerId,
      lockedAt: new Date(),
      stepMessage: "Job execution started",
      attempts: candidate.attempts + 1,
    },
  });

  if (lockedJob.count === 0) {
    // Another worker acquired this job in parallel
    return { processed: false };
  }

  const job = await prisma.job.findUnique({ where: { id: candidate.id } });
  if (!job) return { processed: false };

  const handler = jobHandlers.get(job.jobType);
  if (!handler) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        stepMessage: `No handler registered for job type: ${job.jobType}`,
        errorDetailsJson: JSON.stringify({ error: "UNREGISTERED_JOB_HANDLER" }),
        lockedBy: null,
      },
    });
    return { processed: true, jobId: job.id, status: "FAILED", error: "Unregistered handler" };
  }

  let parsedPayload: Record<string, any> = {};
  try {
    parsedPayload = JSON.parse(job.payloadJson || "{}");
  } catch {
    parsedPayload = {};
  }

  const signal = {
    isCancelled: async () => {
      const current = await prisma.job.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      return current?.status === "CANCELLED";
    },
  };

  const progressCallback = async (pct: number, msg: string) => {
    await updateJobProgress(job.id, pct, msg);
  };

  try {
    const result = await handler(parsedPayload, progressCallback, signal);

    // Check if was cancelled during execution
    if (await signal.isCancelled()) {
      return { processed: true, jobId: job.id, status: "CANCELLED" };
    }

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        progressPct: 100,
        stepMessage: "Execution successfully completed",
        resultJson: JSON.stringify(result || {}),
        lockedBy: null,
      },
    });

    return { processed: true, jobId: job.id, status: "COMPLETED" };
  } catch (err: any) {
    const errorMessage = err?.message || "Execution error encountered during background job processing";

    if (job.attempts < job.maxAttempts) {
      // Requeue with backoff
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          stepMessage: `Transient failure (attempt ${job.attempts}/${job.maxAttempts}): ${errorMessage}. Requeued for retry.`,
          errorDetailsJson: JSON.stringify({ error: errorMessage, attempt: job.attempts }),
          lockedBy: null,
        },
      }).catch(() => {});
      return { processed: true, jobId: job.id, status: "QUEUED", error: errorMessage };
    } else {
      // Max attempts exhausted -> mark FAILED
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          stepMessage: `Job failed after ${job.attempts} attempts: ${errorMessage}`,
          errorDetailsJson: JSON.stringify({ error: errorMessage, totalAttempts: job.attempts }),
          lockedBy: null,
        },
      }).catch(() => {});
      return { processed: true, jobId: job.id, status: "FAILED", error: errorMessage };
    }
  }
}

/**
 * Cancel a job safely with tenant scoping
 */
export async function cancelJob(jobId: string, organizationId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId },
  });

  if (!job) {
    return { success: false, error: "Job not found in this organization." };
  }

  if (job.status === "COMPLETED") {
    return { success: false, error: "Cannot cancel an already completed job." };
  }

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "CANCELLED",
      stepMessage: "Job cancelled by organization user",
      lockedBy: null,
    },
  });

  return { success: true };
}


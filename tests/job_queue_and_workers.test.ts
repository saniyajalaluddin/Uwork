import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { hashPassword } from "../src/lib/auth/password";
import { saveUploadedFile } from "../src/lib/storage/storage";
import {
  enqueueJob,
  processNextJob,
  cancelJob,
  registerJobHandler,
} from "../src/services/job-queue.service";
import "../src/services/workers";
import { GET as listJobs } from "../src/app/api/jobs/route";
import { GET as getJob } from "../src/app/api/jobs/[id]/route";
import { POST as cancelJobRoute } from "../src/app/api/jobs/[id]/cancel/route";
import { POST as cleanDatasetRoute } from "../src/app/api/datasets/clean/route";
import { NextRequest } from "next/server";

test("Phase 4: Async Job Queue Runner & Event Loop Isolation", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("JobRunnerPass123!#");

  // Create Tenant Alpha
  const orgA = await prisma.organization.create({
    data: { name: `Job Org A ${timestamp}`, slug: `job-org-a-${timestamp}` },
  });
  const userA = await prisma.user.create({
    data: {
      email: `job_user_a_${timestamp}@example.com`,
      passwordHash,
      firstName: "Worker",
      lastName: "TesterA",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgA.id, userId: userA.id, role: "ADMIN" },
  });
  const sessionA = await createSession(userA.id, orgA.id);

  // Create Tenant Beta (Adversary / Isolation Check)
  const orgB = await prisma.organization.create({
    data: { name: `Job Org B ${timestamp}`, slug: `job-org-b-${timestamp}` },
  });
  const userB = await prisma.user.create({
    data: {
      email: `job_user_b_${timestamp}@example.com`,
      passwordHash,
      firstName: "Adversary",
      lastName: "TesterB",
    },
  });
  await prisma.organizationMember.create({
    data: { organizationId: orgB.id, userId: userB.id, role: "ADMIN" },
  });
  const sessionB = await createSession(userB.id, orgB.id);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Job Enqueueing & Idempotency Key De-duplication
    // ------------------------------------------------------------------------
    await t.test("1. Enqueues job with status QUEUED and enforces idempotency", async () => {
      const idempotencyKey = `clean_${timestamp}_test1`;
      const job1 = await enqueueJob({
        organizationId: orgA.id,
        jobType: "DATA_CLEANING",
        payload: { task: "demo_test" },
        idempotencyKey,
      });

      assert.strictEqual(job1.status, "QUEUED");
      assert.strictEqual(job1.progressPct, 0);

      // Attempt second enqueue with same idempotency key
      const job2 = await enqueueJob({
        organizationId: orgA.id,
        jobType: "DATA_CLEANING",
        payload: { task: "duplicate_call" },
        idempotencyKey,
      });

      assert.strictEqual(job1.id, job2.id, "Second call must return existing job instance without creating duplicates");

      // Mark cancelled so it does not block FIFO queue
      await prisma.job.update({ where: { id: job1.id }, data: { status: "CANCELLED" } });
    });

    // ------------------------------------------------------------------------
    // TEST 2: Atomic Distributed Lock & Worker Execution Lifecycle
    // ------------------------------------------------------------------------
    await t.test("2. Worker claims job atomically, executes handler, and updates progress to COMPLETED", async () => {
      let progressRecorded: number[] = [];
      registerJobHandler("FILE_INGESTION", async (payload, updateProgress) => {
        await updateProgress(50, "Halfway processed");
        progressRecorded.push(50);
        await updateProgress(90, "Almost done");
        progressRecorded.push(90);
        return { importedRows: 1500 };
      });

      const queued = await enqueueJob({
        organizationId: orgA.id,
        jobType: "FILE_INGESTION",
        payload: { file: "test.csv" },
      });

      // Process job using worker runner
      const workerResult = await processNextJob("test_worker_unit_1", { jobId: queued.id });
      assert.strictEqual(workerResult.processed, true);
      assert.strictEqual(workerResult.status, "COMPLETED");

      const refreshed = await prisma.job.findUnique({ where: { id: queued.id } });
      assert.strictEqual(refreshed?.status, "COMPLETED");
      assert.strictEqual(refreshed?.progressPct, 100);
      assert.ok(refreshed?.resultJson?.includes("1500"));
      assert.deepStrictEqual(progressRecorded, [50, 90]);
    });

    // ------------------------------------------------------------------------
    // TEST 3: Retries with Backoff on Transient Worker Failure
    // ------------------------------------------------------------------------
    await t.test("3. Transient errors requeue with incremented attempt until maxAttempts is reached", async () => {
      let attemptCount = 0;
      registerJobHandler("FORECAST_RUN", async () => {
        attemptCount++;
        throw new Error(`Worker simulated failure ${attemptCount}`);
      });

      const failingJob = await enqueueJob({
        organizationId: orgA.id,
        jobType: "FORECAST_RUN",
        payload: { model: "PROPHET" },
        maxAttempts: 2,
      });

      // Attempt 1: should re-queue
      const run1 = await processNextJob("worker_retry_test", { jobId: failingJob.id });
      assert.strictEqual(run1.status, "QUEUED");
      const jobAfterRun1 = await prisma.job.findUnique({ where: { id: failingJob.id } });
      assert.strictEqual(jobAfterRun1?.attempts, 1);
      assert.strictEqual(jobAfterRun1?.status, "QUEUED");

      // Attempt 2: should exhaust maxAttempts (2) and transition to FAILED
      const run2 = await processNextJob("worker_retry_test", { jobId: failingJob.id });
      assert.strictEqual(run2.status, "FAILED");
      const jobAfterRun2 = await prisma.job.findUnique({ where: { id: failingJob.id } });
      assert.strictEqual(jobAfterRun2?.attempts, 2);
      assert.strictEqual(jobAfterRun2?.status, "FAILED");
      assert.ok(jobAfterRun2?.errorDetailsJson?.includes("Worker simulated failure 2"));
    });

    // ------------------------------------------------------------------------
    // TEST 4: Job Cancellation with Strict Multi-Tenant Scoping
    // ------------------------------------------------------------------------
    await t.test("4. Prevents cross-tenant job cancellation (IDOR) and allows tenant cancellation", async () => {
      const orgAJob = await enqueueJob({
        organizationId: orgA.id,
        jobType: "DATA_CLEANING",
        payload: { sample: true },
      });

      // Adversary (Tenant B) attempts to cancel Tenant A's job via cancelJob
      const adversaryCancel = await cancelJob(orgAJob.id, orgB.id);
      assert.strictEqual(adversaryCancel.success, false);
      assert.ok(adversaryCancel.error?.includes("not found"));

      // Verify job remains QUEUED
      const checkA = await prisma.job.findUnique({ where: { id: orgAJob.id } });
      assert.strictEqual(checkA?.status, "QUEUED");

      // Tenant A cancels their own job
      const legitCancel = await cancelJob(orgAJob.id, orgA.id);
      assert.strictEqual(legitCancel.success, true);

      const checkCancelled = await prisma.job.findUnique({ where: { id: orgAJob.id } });
      assert.strictEqual(checkCancelled?.status, "CANCELLED");
    });

    // ------------------------------------------------------------------------
    // TEST 5: REST API Multi-Tenant Jobs List & Status Scoping
    // ------------------------------------------------------------------------
    await t.test("5. GET /api/jobs and GET /api/jobs/[id] enforce strict tenant isolation", async () => {
      // 1. Tenant A lists jobs
      const reqListA = new NextRequest("http://localhost:3000/api/jobs", {
        headers: new Headers({ cookie: `uwork_session=${sessionA.rawToken}` }),
      });
      const resListA = await listJobs(reqListA);
      const jsonListA = await resListA.json();
      assert.strictEqual(resListA.status, 200);
      assert.ok(jsonListA.data.jobs.length > 0);

      // 2. Tenant B lists jobs - should NOT see Tenant A's jobs
      const reqListB = new NextRequest("http://localhost:3000/api/jobs", {
        headers: new Headers({ cookie: `uwork_session=${sessionB.rawToken}` }),
      });
      const resListB = await listJobs(reqListB);
      const jsonListB = await resListB.json();
      assert.strictEqual(resListB.status, 200);
      assert.strictEqual(jsonListB.data.jobs.length, 0, "Tenant B must not see any of Tenant A's jobs");

      // 3. Tenant B directly probes Tenant A's job ID (IDOR probe)
      const targetJobId = jsonListA.data.jobs[0].id;
      const reqGetB = new NextRequest(`http://localhost:3000/api/jobs/${targetJobId}`, {
        headers: new Headers({ cookie: `uwork_session=${sessionB.rawToken}` }),
      });
      const resGetB = await getJob(reqGetB, { params: Promise.resolve({ id: targetJobId }) });
      assert.strictEqual(resGetB.status, 404, "Must return 404 when querying another tenant's job ID");

      // 4. Tenant B tries to cancel Tenant A's job via POST /api/jobs/[id]/cancel
      const reqCancelB = new NextRequest(`http://localhost:3000/api/jobs/${targetJobId}/cancel`, {
        method: "POST",
        headers: new Headers({ cookie: `uwork_session=${sessionB.rawToken}` }),
      });
      const resCancelB = await cancelJobRoute(reqCancelB, { params: Promise.resolve({ id: targetJobId }) });
      assert.strictEqual(resCancelB.status, 400);
    });

    // ------------------------------------------------------------------------
    // TEST 6: End-to-End Async Dataset Cleaning Pipeline
    // ------------------------------------------------------------------------
    await t.test("6. Asynchronous dataset cleaning enqueues, executes, and creates cleaned dataset version", async () => {
      // Create seed dataset with duplicate rows and untrimmed spaces
      const rawCsv = [
        "Product,Region,Sales",
        "Widget Alpha  ,North,100",
        "Widget Alpha  ,North,100", // Duplicate row
        "Widget Beta,South  ,200",   // Untrimmed South
      ].join("\n");

      const savedFile = await saveUploadedFile(orgA.id, "cleaning_source.csv", Buffer.from(rawCsv, "utf-8"));

      const dataset = await prisma.dataset.create({
        data: {
          organizationId: orgA.id,
          name: "Cleaning Test Dataset",
          createdById: userA.id,
        },
      });

      const v1 = await prisma.datasetVersion.create({
        data: {
          datasetId: dataset.id,
          versionNumber: 1,
          storagePath: savedFile.storagePath,
          fileName: savedFile.sanitizedName,
          fileSizeBytes: savedFile.fileSizeBytes,
          mimeType: "text/csv",
          rowCount: 3,
          columnCount: 3,
          checksumSha256: savedFile.checksumSha256,
          status: "READY",
        },
      });

      // Call POST /api/datasets/clean
      const reqClean = new NextRequest("http://localhost:3000/api/datasets/clean", {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          cookie: `uwork_session=${sessionA.rawToken}`,
        }),
        body: JSON.stringify({
          datasetVersionId: v1.id,
          operations: [
            { type: "DEDUPLICATE" },
            { type: "TRIM_WHITESPACE" },
          ],
        }),
      });

      const resClean = await cleanDatasetRoute(reqClean);
      assert.strictEqual(resClean.status, 202, "Enqueuing must return 202 Accepted immediately");
      const jsonClean = await resClean.json();
      assert.ok(jsonClean.data.jobId);
      assert.strictEqual(jsonClean.data.status, "QUEUED");

      // Execute worker or wait if already processed by background worker triggered by setImmediate
      let workerRes = await processNextJob("test_cleaning_worker", { jobId: jsonClean.data.jobId });
      if (!workerRes.processed) {
        // Wait up to 500ms for the background worker triggered by setImmediate to complete
        for (let attempt = 0; attempt < 10; attempt++) {
          const completedJob = await prisma.job.findUnique({ where: { id: jsonClean.data.jobId } });
          if (completedJob && (completedJob.status === "COMPLETED" || completedJob.status === "FAILED")) {
            workerRes = { processed: true, jobId: completedJob.id, status: completedJob.status as any };
            break;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      assert.strictEqual(workerRes.processed, true);
      assert.strictEqual(workerRes.status, "COMPLETED");

      // Verify new version created in DB
      const v2 = await prisma.datasetVersion.findFirst({
        where: { datasetId: dataset.id, versionNumber: 2 },
        include: { validationResult: true, columns: true },
      });

      assert.ok(v2, "Cleaned dataset version 2 must exist");
      assert.strictEqual(v2?.cleanedFromVersionId, v1.id);
      assert.strictEqual(v2?.rowCount, 2, "Row count should be 2 after deduplication");
      assert.ok(v2?.validationResult?.qualityScore && v2.validationResult.qualityScore >= 60);
      assert.strictEqual(v2?.columns.length, 3);
    });

  } finally {
    // Teardown test orgs
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
  }
});
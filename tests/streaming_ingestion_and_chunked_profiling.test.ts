import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { createSession } from "../src/lib/auth/session";
import { profileFileChunked, profileDataset } from "../src/services/profiler.service";
import { POST as uploadDatasetRoute } from "../src/app/api/datasets/upload/route";
import { NextRequest } from "next/server";

test("Phase 14: Streaming Dataset Ingestion & Chunked Memory Profiling", async (t) => {
  const timestamp = Date.now();

  // Setup Test Organization and User
  const org = await prisma.organization.create({
    data: {
      name: `Streaming Analytics Org ${timestamp}`,
      slug: `streaming-org-${timestamp}`,
    },
  });

  const user = await prisma.user.create({
    data: {
      email: `data_engineer_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "Data",
      lastName: "Engineer",
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "ANALYST",
    },
  });

  const session = await createSession(user.id, org.id);

  await t.test("1. Streaming chunked profiler processes dataset with bounded memory footprint", async () => {
    // Generate a 3,000-row CSV in memory
    const header = "Date,Revenue,Units,Cost,Region\n";
    const rows: string[] = [];
    for (let i = 1; i <= 3000; i++) {
      const date = `2026-01-${String((i % 28) + 1).padStart(2, "0")}`;
      const rev = 1000 + (i % 500);
      const units = 10 + (i % 20);
      const cost = 400 + (i % 200);
      const region = i % 3 === 0 ? "North" : i % 3 === 1 ? "South" : "West";
      rows.push(`${date},${rev},${units},${cost},${region}`);
    }
    const csvBuffer = Buffer.from(header + rows.join("\n"), "utf-8");

    // Profile using chunk size 500 and sample preview capped at 50
    const profile = await profileFileChunked(csvBuffer, "sales_stream.csv", {
      chunkSize: 500,
      sampleRowsLimit: 50,
    });

    assert.strictEqual(profile.rowCount, 3000, "Must count all 3,000 streamed rows");
    assert.strictEqual(profile.columnCount, 5, "Must discover all 5 columns");
    assert.strictEqual(
      profile.parsedRows.length,
      50,
      "Preview rows buffer must be bounded at sampleRowsLimit (50) to prevent OOM"
    );

    // Verify memory statistics
    assert.ok(profile.memoryStats, "Memory statistics must be generated");
    assert.ok(profile.memoryStats.chunksProcessed >= 6, "Must process at least 6 chunks for 3,000 rows");
    assert.ok(profile.memoryStats.peakHeapMB > 0, "Peak heap memory must be recorded");
    assert.ok(profile.memoryStats.durationMs >= 0, "Duration must be recorded");

    // Verify column profiles
    const revCol = profile.columns.find((c) => c.name === "Revenue");
    assert.ok(revCol, "Revenue column profile must exist");
    assert.strictEqual(revCol.dataType, "NUMERIC");
    assert.strictEqual(revCol.inferredBusinessRole, "REVENUE");
    assert.strictEqual(revCol.summaryStats.min, 1000);
    assert.strictEqual(revCol.summaryStats.max, 1499);
    assert.ok(revCol.summaryStats.mean! >= 1200 && revCol.summaryStats.mean! <= 1300);
    assert.ok(revCol.summaryStats.median! >= 1200 && revCol.summaryStats.median! <= 1300);
  });

  await t.test("2. Online Welford's algorithm and reservoir sampling compute exact statistics", async () => {
    // Generate uniform sequential series 1..1000
    // True Mean = 500.5, True Std = sqrt((1000^2 - 1) / 12) ~ 288.675, True Median = 500.5
    const header = "Date,Val\n";
    const lines: string[] = [];
    for (let i = 1; i <= 1000; i++) {
      lines.push(`2026-01-01,${i}`);
    }
    const buffer = Buffer.from(header + lines.join("\n"), "utf-8");

    const profile = await profileFileChunked(buffer, "stats_test.csv", {
      chunkSize: 200,
      sampleRowsLimit: 10,
    });

    const valCol = profile.columns.find((c) => c.name === "Val");
    assert.ok(valCol);
    assert.strictEqual(valCol.summaryStats.min, 1);
    assert.strictEqual(valCol.summaryStats.max, 1000);
    assert.strictEqual(valCol.summaryStats.mean, 500.5);

    // Standard deviation within 1 unit of theoretical ~288.67
    assert.ok(
      Math.abs(valCol.summaryStats.std! - 288.67) < 1,
      `Welford's std (${valCol.summaryStats.std}) must match expected ~288.67`
    );

    // Median must equal 500.5
    assert.strictEqual(valCol.summaryStats.median, 500.5);
  });

  await t.test("3. Intercepts formula injections and sanitizes sample metadata during streaming", async () => {
    const csvContent = [
      "Date,Product,Amount",
      "2026-01-01,Widget Alpha,50",
      "2026-01-02,=cmd|' /C calc'!A0,100",
      "2026-01-03,Normal Beta,75",
      "2026-01-04,@SUM(1+1),80",
    ].join("\n");

    const profile = await profileFileChunked(Buffer.from(csvContent), "dirty_stream.csv", {
      chunkSize: 2,
    });

    assert.strictEqual(profile.rowCount, 4);

    const injectionIssue = profile.issues.find((i) => i.code === "FORMULA_INJECTION_DETECTED");
    assert.ok(injectionIssue, "Must flag formula injection detected during streaming chunk processing");
    assert.strictEqual(injectionIssue.column, "Product");

    const prodCol = profile.columns.find((c) => c.name === "Product");
    assert.ok(prodCol);
    assert.ok(
      prodCol.sampleValues.includes("'=cmd|' /C calc'!A0"),
      "Sample values must be sanitized with leading quote"
    );
    assert.ok(
      prodCol.sampleValues.includes("'@SUM(1+1)"),
      "Sample values must be sanitized with leading quote"
    );
  });

  await t.test("4. Multipart Form Upload route returns streaming memory profiling telemetry", async () => {
    const csvContent = [
      "TransactionDate,RevenueAmount,UnitsSold",
      "2026-01-01,15000,30",
      "2026-01-02,18500,37",
      "2026-01-03,22000,44",
    ].join("\n");

    const formData = new FormData();
    formData.append("name", `Streamed Production Dataset ${timestamp}`);
    formData.append("description", "Uploaded via streaming memory-profiled pipeline");
    formData.append(
      "file",
      new Blob([Buffer.from(csvContent, "utf-8")], { type: "text/csv" }),
      "financial_stream.csv"
    );

    const req = new NextRequest(new URL("http://localhost:3000/api/datasets/upload"), {
      method: "POST",
      body: formData,
      headers: {
        cookie: `uwork_session=${session.rawToken}`,
      },
    });

    const res = await uploadDatasetRoute(req);
    assert.strictEqual(res.status, 200, "Dataset upload route must return HTTP 200");

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.datasetId, "Must return created datasetId");
    assert.strictEqual(json.data.rowCount, 3);
    assert.strictEqual(json.data.columnCount, 3);

    // Verify memoryStats returned in response
    assert.ok(json.data.memoryStats, "Must return memoryStats telemetry in upload response");
    assert.ok(json.data.memoryStats.peakHeapMB > 0);
    assert.ok(json.data.memoryStats.chunksProcessed >= 1);
    assert.ok(json.data.memoryStats.durationMs >= 0);

    // Verify persisted in database
    const dbDataset = await prisma.dataset.findUnique({
      where: { id: json.data.datasetId },
      include: { versions: { include: { columns: true } } },
    });
    assert.ok(dbDataset);
    assert.strictEqual(dbDataset.versions[0].columns.length, 3);
  });
});

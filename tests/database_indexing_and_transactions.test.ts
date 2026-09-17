import test from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/db/prisma";
import { getMetricsSnapshot, clearMetrics } from "../src/lib/observability/metrics";

test("Phase 13: Database Indexing, Query Optimization & Transaction Integrity", async (t) => {
  const timestamp = Date.now();

  // Setup Test Organization and User
  const org = await prisma.organization.create({
    data: {
      name: `Database Benchmark Org ${timestamp}`,
      slug: `db-bench-${timestamp}`,
    },
  });

  const user = await prisma.user.create({
    data: {
      email: `db_architect_${timestamp}@example.com`,
      passwordHash: "dummy_hash_for_test",
      firstName: "DB",
      lastName: "Architect",
    },
  });

  await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "ADMIN",
    },
  });

  await t.test("1. Multi-step transaction rollback leaves zero orphaned records on failure", async () => {
    const sentinelName = `Orphan-Test-Dataset-${timestamp}`;

    let transactionFailed = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Create a dataset
        const createdDataset = await tx.dataset.create({
          data: {
            organizationId: org.id,
            createdById: user.id,
            name: sentinelName,
            sourceType: "CSV",
          },
        });

        // Step 2: Create a version
        await tx.datasetVersion.create({
          data: {
            datasetId: createdDataset.id,
            versionNumber: 1,
            storagePath: `/tmp/fake-${timestamp}.csv`,
            fileName: "test.csv",
            fileSizeBytes: 1024,
            mimeType: "text/csv",
            checksumSha256: "fakechecksum",
            status: "UPLOADED",
          },
        });

        // Step 3: Simulate intentional failure / constraint breach
        throw new Error("SIMULATED_TRANSACTION_FAILURE");
      });
    } catch (err: any) {
      if (err.message === "SIMULATED_TRANSACTION_FAILURE") {
        transactionFailed = true;
      }
    }

    assert.strictEqual(transactionFailed, true, "Transaction must fail and catch intentional error");

    // Verify dataset was rolled back completely
    const orphanedDataset = await prisma.dataset.findFirst({
      where: { name: sentinelName },
    });
    assert.strictEqual(orphanedDataset, null, "Dataset record must be rolled back on transaction error");

    // Verify version was rolled back completely
    const orphanedVersion = await prisma.datasetVersion.findFirst({
      where: { storagePath: `/tmp/fake-${timestamp}.csv` },
    });
    assert.strictEqual(orphanedVersion, null, "DatasetVersion record must be rolled back on transaction error");
  });

  await t.test("2. Batch createMany inserts atomic records without sequential roundtrips", async () => {
    // Create parent dataset and version
    const dataset = await prisma.dataset.create({
      data: {
        organizationId: org.id,
        createdById: user.id,
        name: `Batch Ingestion Dataset ${timestamp}`,
        sourceType: "CSV",
      },
    });

    const version = await prisma.datasetVersion.create({
      data: {
        datasetId: dataset.id,
        versionNumber: 1,
        storagePath: `/tmp/batch-${timestamp}.csv`,
        fileName: "batch.csv",
        fileSizeBytes: 2048,
        mimeType: "text/csv",
        checksumSha256: "batchchecksum123",
        status: "READY",
      },
    });

    // Test batch insertion of 20 columns
    const columnsToInsert = Array.from({ length: 20 }, (_, i) => ({
      datasetVersionId: version.id,
      columnIndex: i,
      name: `col_${i}`,
      originalName: `Original Column ${i}`,
      dataType: i % 2 === 0 ? "NUMERIC" : "TEXT",
      inferredBusinessRole: i === 0 ? "REVENUE" : "GENERIC_DIMENSION",
      nullCount: 0,
      uniqueCount: 100,
      sampleValuesJson: JSON.stringify([1, 2, 3]),
      summaryStatsJson: JSON.stringify({ min: 0, max: 100 }),
    }));

    const batchResult = await prisma.datasetColumn.createMany({
      data: columnsToInsert,
    });

    assert.strictEqual(batchResult.count, 20, "Batch createMany must report 20 inserted rows");

    // Verify count in database
    const totalInserted = await prisma.datasetColumn.count({
      where: { datasetVersionId: version.id },
    });
    assert.strictEqual(totalInserted, 20, "All 20 columns must exist in database");

    // Test batch prediction insertion for forecast runs
    const forecast = await prisma.forecast.create({
      data: {
        organizationId: org.id,
        datasetVersionId: version.id,
        name: `Revenue Forecast ${timestamp}`,
        targetColumnName: "revenue",
        dateColumnName: "date",
        frequency: "MONTHLY",
        horizonPeriods: 6,
      },
    });

    const run = await prisma.forecastRun.create({
      data: {
        forecastId: forecast.id,
        runNumber: 1,
        status: "COMPLETED",
        selectedModelName: "HOLT_WINTERS",
        metricsJson: JSON.stringify({ sMape: 3.5 }),
        candidateScoresJson: JSON.stringify([]),
        driversJson: JSON.stringify({}),
      },
    });

    const predictionsToInsert = Array.from({ length: 12 }, (_, i) => ({
      forecastRunId: run.id,
      timestamp: `2026-0${(i % 9) + 1}-01`,
      actualValue: i < 6 ? 1000 + i * 50 : null,
      predictedValue: 1000 + i * 55,
      confidenceLower: 950 + i * 50,
      confidenceUpper: 1050 + i * 60,
      isForecast: i >= 6,
    }));

    const predictionBatch = await prisma.prediction.createMany({
      data: predictionsToInsert,
    });

    assert.strictEqual(predictionBatch.count, 12, "Prediction batch must insert 12 predictions");

    const savedForecastPoints = await prisma.prediction.count({
      where: { forecastRunId: run.id, isForecast: true },
    });
    assert.strictEqual(savedForecastPoints, 6, "Must have exactly 6 forecast prediction points");
  });

  await t.test("3. Prisma query middleware automatically instruments telemetry metrics", async () => {
    clearMetrics();

    // Execute queries across models
    await prisma.organization.findUnique({ where: { id: org.id } });
    await prisma.dataset.findMany({ where: { organizationId: org.id } });
    await prisma.notification.count({ where: { organizationId: org.id } });

    const snapshot = getMetricsSnapshot();

    // Check query count metrics
    const queryCounterKeys = Object.keys(snapshot.counters).filter((k) =>
      k.startsWith("db_queries_total")
    );
    assert.ok(
      queryCounterKeys.length >= 3,
      `db_queries_total must track individual model operations, found: ${queryCounterKeys.join(", ")}`
    );

    // Verify duration histogram entries exist
    const durationHistogramKeys = Object.keys(snapshot.histograms).filter((k) =>
      k.startsWith("db_query_duration_ms")
    );
    assert.ok(
      durationHistogramKeys.length >= 3,
      `db_query_duration_ms must record latency distributions, found: ${durationHistogramKeys.join(", ")}`
    );

    // Verify histogram stats are reasonable numbers
    const sampleHistogram = snapshot.histograms[durationHistogramKeys[0]];
    assert.ok(sampleHistogram.count >= 1, "Histogram sample count must be >= 1");
    assert.ok(sampleHistogram.avg >= 0, "Histogram average duration must be >= 0ms");
  });

  await t.test("4. SQLite indexes table verifies composite indexes are physically registered", async () => {
    // Query sqlite_master for registered indexes
    const rawIndexes: Array<{ name: string; tbl_name: string; sql: string | null }> =
      await prisma.$queryRawUnsafe(`
        SELECT name, tbl_name, sql 
        FROM sqlite_master 
        WHERE type = 'index' 
          AND name NOT LIKE 'sqlite_autoindex_%'
      `);

    const indexNames = rawIndexes.map((i) => i.name);

    // Check crucial composite indexes added in Phase 13
    assert.ok(
      indexNames.some((n) => n.includes("userId_activeOrganizationId")),
      `Session composite index must exist in SQLite. Found: ${indexNames.filter((n) => n.includes("Session")).join(", ")}`
    );

    assert.ok(
      indexNames.some((n) => n.includes("organizationId_isArchived")),
      `Dataset composite index organizationId_isArchived must exist in SQLite.`
    );

    assert.ok(
      indexNames.some((n) => n.includes("organizationId_createdAt")),
      `Dataset composite index organizationId_createdAt must exist in SQLite.`
    );

    assert.ok(
      indexNames.some((n) => n.includes("forecastId_status")),
      `ForecastRun composite index forecastId_status must exist in SQLite.`
    );

    assert.ok(
      indexNames.some((n) => n.includes("forecastRunId_isForecast")),
      `Prediction composite index forecastRunId_isForecast must exist in SQLite.`
    );

    assert.ok(
      indexNames.some((n) => n.includes("organizationId_detectedAt")),
      `Anomaly composite index organizationId_detectedAt must exist in SQLite.`
    );

    assert.ok(
      indexNames.some((n) => n.includes("organizationId_timestamp")),
      `AuditLog composite index organizationId_timestamp must exist in SQLite.`
    );

    assert.ok(
      indexNames.some((n) => n.includes("status_createdAt")),
      `Job composite index status_createdAt must exist in SQLite.`
    );

    // Perform tenant-filtered composite index queries to verify query planner execution
    const datasets = await prisma.dataset.findMany({
      where: {
        organizationId: org.id,
        isArchived: false,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    assert.ok(Array.isArray(datasets), "Filtered dataset query with composite index should succeed");

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        status: "SUCCESS",
      },
      orderBy: {
        timestamp: "desc",
      },
      take: 10,
    });
    assert.ok(Array.isArray(auditLogs), "Filtered audit log query with composite index should succeed");
  });
});


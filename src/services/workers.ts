import { registerJobHandler, JobType } from "./job-queue.service";
import { prisma } from "../lib/db/prisma";
import { readStorageFile, saveUploadedFile } from "../lib/storage/storage";
import { parseFileBuffer, profileDataset } from "./profiler.service";
import { executeDataCleaning, CleaningOperation } from "./cleaning.service";
import { generateForecast } from "./forecasting.service";
import { generateExecutiveReport } from "./report.service";

/**
 * Register core background worker processors
 */
export function initWorkerHandlers(): void {
  // 1. DATA_CLEANING Worker
  registerJobHandler("DATA_CLEANING", async (payload, updateProgress, signal) => {
    const { datasetVersionId, operations = [], organizationId, userId } = payload;
    if (!datasetVersionId) throw new Error("Missing datasetVersionId in payload.");

    await updateProgress(10, "Retrieving dataset version from secure storage");
    const version = await prisma.datasetVersion.findUnique({
      where: { id: datasetVersionId },
      include: { dataset: true },
    });
    if (!version) throw new Error("Dataset version not found.");

    if (await signal.isCancelled()) return { cancelled: true };

    await updateProgress(25, "Reading and parsing stored file buffer");
    const fileBuffer = await readStorageFile(version.storagePath);
    const rows = parseFileBuffer(fileBuffer, version.fileName);

    await updateProgress(50, `Executing ${operations.length} data cleaning transformations`);
    const cleaningResult = executeDataCleaning(rows, operations as CleaningOperation[]);

    if (await signal.isCancelled()) return { cancelled: true };

    await updateProgress(70, "Profiling cleaned dataset and validating quality metrics");
    const profile = profileDataset(cleaningResult.cleanedRows);

    await updateProgress(85, "Serializing cleaned dataset and committing to storage");
    // Generate CSV string for cleaned rows
    const headers = Object.keys(cleaningResult.cleanedRows[0] || {});
    const csvLines = [headers.join(",")];
    for (const r of cleaningResult.cleanedRows) {
      csvLines.push(headers.map((h) => JSON.stringify(r[h] ?? "")).join(","));
    }
    const cleanedCsvBuffer = Buffer.from(csvLines.join("\n"), "utf-8");

    const cleanedFileName = `Cleaned_${version.fileName.replace(/\.[^/.]+$/, "")}.csv`;
    const storageResult = await saveUploadedFile(
      version.dataset.organizationId,
      cleanedFileName,
      cleanedCsvBuffer
    );

    await updateProgress(95, "Registering new dataset version in catalog");
    const nextVersionNumber = version.versionNumber + 1;

    const newVersion = await prisma.$transaction(async (tx) => {
      const v = await tx.datasetVersion.create({
        data: {
          datasetId: version.datasetId,
          versionNumber: nextVersionNumber,
          storagePath: storageResult.storagePath,
          fileName: storageResult.sanitizedName,
          fileSizeBytes: storageResult.fileSizeBytes,
          mimeType: "text/csv",
          rowCount: profile.rowCount,
          columnCount: profile.columnCount,
          checksumSha256: storageResult.checksumSha256,
          status: "READY",
          cleanedFromVersionId: version.id,
        },
      });

      await tx.dataset.update({
        where: { id: version.datasetId },
        data: { currentVersionId: v.id },
      });

      // Insert columns in batch
      await tx.datasetColumn.createMany({
        data: profile.columns.map((col, i) => ({
          datasetVersionId: v.id,
          columnIndex: i,
          name: col.name,
          originalName: col.originalName,
          dataType: col.dataType,
          inferredBusinessRole: col.inferredBusinessRole,
          nullCount: col.nullCount,
          uniqueCount: col.uniqueCount,
          sampleValuesJson: JSON.stringify(col.sampleValues),
          summaryStatsJson: JSON.stringify(col.summaryStats),
        })),
      });

      // Insert Validation
      await tx.dataValidationResult.create({
        data: {
          datasetVersionId: v.id,
          qualityScore: profile.qualityScore,
          passed: profile.qualityScore >= 60,
          totalRulesEvaluated: 10 + profile.columns.length,
          summaryJson: JSON.stringify({
            rowCount: profile.rowCount,
            columnCount: profile.columnCount,
            duplicateRows: profile.duplicateRows,
          }),
          issuesJson: JSON.stringify(profile.issues),
        },
      });

      return v;
    });

    await updateProgress(100, "Dataset cleaning pipeline complete");

    return {
      previousVersionId: version.id,
      newVersionId: newVersion.id,
      versionNumber: nextVersionNumber,
      rowsAffected: cleaningResult.rowsAffected,
      operationsApplied: cleaningResult.operationsApplied,
      qualityScore: profile.qualityScore,
    };
  });

  // 2. REPORT_EXPORT Worker
  registerJobHandler("REPORT_EXPORT", async (payload, updateProgress, signal) => {
    const { organizationId, userId, format = "CSV" } = payload;
    await updateProgress(20, "Initiating executive analytics aggregation");
    if (await signal.isCancelled()) return { cancelled: true };

    await updateProgress(60, "Generating secure report digest");
    const result = await generateExecutiveReport(organizationId, userId, format);

    await updateProgress(100, "Report successfully generated and stored");
    return result;
  });
}

// Auto-initialize handlers on import
initWorkerHandlers();


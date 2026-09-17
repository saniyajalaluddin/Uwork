import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission, enforceRateLimit } from "@/lib/api/middleware";
import { saveUploadedFile, deleteStorageFile, resolveStorageFilePath } from "@/lib/storage/storage";
import { validateFileBuffer } from "@/lib/security/file-validator";
import { profileFileChunked } from "@/services/profiler.service";
import { successResponse, errorResponse } from "@/lib/api/response";
import { AppConfig } from "@/config/app.config";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "datasets:write");
  if ("error" in auth) return auth.error;

  const rateLimitCheck = enforceRateLimit(
    req,
    "dataset_upload",
    AppConfig.rateLimits.datasetUpload,
    auth.context.user.id
  );
  if (rateLimitCheck.error) return rateLimitCheck.error;

  const { context } = auth;
  const orgId = context.organization.id;
  let savedStoragePath: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string) || file?.name || "Uploaded Dataset";
    const description = (formData.get("description") as string) || "";

    if (!file) {
      return errorResponse("No file was uploaded.", 400);
    }

    // 1. File Size Verification (Configurable, defaults to 50MB)
    const MAX_FILE_SIZE = AppConfig.storage.maxUploadSizeBytes;
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(
        `File exceeds maximum allowed size of ${AppConfig.storage.maxUploadSizeMB}MB.`,
        413
      );
    }

    // 2. Read Buffer & Verify Magic Bytes / File Signatures
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const validation = validateFileBuffer(buffer, file.name);
    if (!validation.valid) {
      return errorResponse(validation.error || "Unsupported or corrupted file.", 415);
    }

    // 3. Save to storage with transactional cleanup guard
    const storageResult = await saveUploadedFile(orgId, file.name, buffer);
    savedStoragePath = storageResult.storagePath;

    // 4. Parse & Profile Data via Streaming Chunked Memory Profiler
    const fullStoragePath = resolveStorageFilePath(savedStoragePath);
    const profile = await profileFileChunked(fullStoragePath, file.name, {
      sampleRowsLimit: 100,
    });

    if (!profile || profile.rowCount === 0) {
      // Immediately purge empty file from disk
      if (savedStoragePath) await deleteStorageFile(savedStoragePath);
      return errorResponse("The uploaded spreadsheet contains no data rows.", 400, "EMPTY_DATASET");
    }

    // 5. Atomic Database Record Creation
    const createdDataset = await prisma.$transaction(async (tx) => {
      const dataset = await tx.dataset.create({
        data: {
          organizationId: orgId,
          name: name.trim(),
          description: description.trim(),
          sourceType: validation.fileType === "CSV" ? "CSV" : "XLSX",
          createdById: context.user.id,
        },
      });

      const version = await tx.datasetVersion.create({
        data: {
          datasetId: dataset.id,
          versionNumber: 1,
          storagePath: storageResult.storagePath,
          fileName: storageResult.sanitizedName,
          fileSizeBytes: storageResult.fileSizeBytes,
          mimeType: validation.mimeType || "application/octet-stream",
          rowCount: profile.rowCount,
          columnCount: profile.columnCount,
          checksumSha256: storageResult.checksumSha256,
          status: "READY",
        },
      });

      await tx.dataset.update({
        where: { id: dataset.id },
        data: { currentVersionId: version.id },
      });

      // Insert Columns with sanitized metadata
      await tx.datasetColumn.createMany({
        data: profile.columns.map((col, i) => ({
          datasetVersionId: version.id,
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

      // Insert Validation Result
      await tx.dataValidationResult.create({
        data: {
          datasetVersionId: version.id,
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

      return { dataset, version };
    });

    // 6. Audit & Notification
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: context.user.id,
        action: "DATASET_UPLOADED",
        resourceType: "DATASET",
        resourceId: createdDataset.dataset.id,
        status: "SUCCESS",
        metadataJson: JSON.stringify({
          fileName: storageResult.sanitizedName,
          rowCount: profile.rowCount,
          qualityScore: profile.qualityScore,
          checksumSha256: storageResult.checksumSha256,
        }),
      },
    });

    await prisma.notification.create({
      data: {
        organizationId: orgId,
        userId: context.user.id,
        title: "Dataset Ingested & Profiled",
        message: `'${name}' was successfully uploaded and profiled with a quality score of ${profile.qualityScore}/100.`,
        type: "DATASET_READY",
        linkUrl: "/data-hub",
      },
    });

    const response = successResponse({
      datasetId: createdDataset.dataset.id,
      versionId: createdDataset.version.id,
      name: createdDataset.dataset.name,
      rowCount: profile.rowCount,
      columnCount: profile.columnCount,
      qualityScore: profile.qualityScore,
      issues: profile.issues,
      columns: profile.columns,
      memoryStats: profile.memoryStats,
    });

    if (rateLimitCheck.headers) {
      for (const [header, val] of Object.entries(rateLimitCheck.headers)) {
        response.headers.set(header, val);
      }
    }

    return response;
  } catch (err: any) {
    // Purge orphaned storage file if error occurred after disk save
    if (savedStoragePath) {
      await deleteStorageFile(savedStoragePath).catch(() => {});
    }
    console.error("Upload error:", err);
    return errorResponse("Failed to process and profile uploaded dataset.", 500);
  }
}

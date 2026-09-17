import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { detectAnomalies, AnomalyDataPoint } from "@/services/anomaly.service";
import { readStorageFile } from "@/lib/storage/storage";
import { parseFileBuffer } from "@/services/profiler.service";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  const anomalies = await prisma.anomaly.findMany({
    where: { organizationId: orgId },
    orderBy: { detectedAt: "desc" },
  });

  const formatted = anomalies.map((a) => {
    let rootCause = {};
    try {
      rootCause = JSON.parse(a.rootCauseJson || "{}");
    } catch {}

    return {
      id: a.id,
      metricName: a.metricName,
      timestamp: a.timestamp,
      observedValue: a.observedValue,
      expectedValue: a.expectedValue,
      deviationPct: a.deviationPct,
      severity: a.severity,
      detectionMethod: a.detectionMethod,
      rootCause,
      isAcknowledged: a.isAcknowledged,
      detectedAt: a.detectedAt,
    };
  });

  return successResponse({ anomalies: formatted });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { datasetVersionId, metricName = "Revenue", points } = body;

    let timeSeriesPoints: AnomalyDataPoint[] = points;
    let targetVersionId = datasetVersionId;

    if (!timeSeriesPoints && datasetVersionId) {
      // Validate tenant boundary on dataset
      const version = await prisma.datasetVersion.findFirst({
        where: {
          id: datasetVersionId,
          dataset: { organizationId: orgId },
        },
        include: { dataset: true, columns: true },
      });

      if (!version) {
        return errorResponse("Dataset version not found in this organization.", 404);
      }

      // Read dataset file
      const buf = await readStorageFile(version.storagePath);
      const rows = parseFileBuffer(buf, version.fileName);

      const dateCol = version.columns.find((c) => c.inferredBusinessRole === "DATE_TIME")?.name || "Date";
      const revCol = version.columns.find((c) => c.inferredBusinessRole === "REVENUE")?.name || "Revenue";
      const segCol = version.columns.find((c) => c.inferredBusinessRole === "REGION")?.name || "Region";

      const agg: Record<string, { value: number; segment: string }> = {};
      for (const r of rows) {
        const d = String(r[dateCol] || "");
        if (d) {
          const v = parseFloat(r[revCol]) || 0;
          if (!agg[d]) agg[d] = { value: 0, segment: String(r[segCol] || "General") };
          agg[d].value += v;
        }
      }

      timeSeriesPoints = Object.entries(agg).map(([date, data]) => ({
        date,
        value: data.value,
        segment: data.segment,
      }));
    }

    if (!timeSeriesPoints || !Array.isArray(timeSeriesPoints) || timeSeriesPoints.length < 5) {
      return errorResponse("At least 5 time series points are required for anomaly detection.", 400);
    }

    // Run non-lookahead Hampel anomaly detection
    const detected = detectAnomalies(timeSeriesPoints);

    // If datasetVersionId not specified, find organization's latest version or provision ad-hoc stream
    if (!targetVersionId) {
      const latest = await prisma.datasetVersion.findFirst({
        where: { dataset: { organizationId: orgId } },
        orderBy: { createdAt: "desc" },
      });
      if (latest) {
        targetVersionId = latest.id;
      } else {
        const adHocDataset = await prisma.dataset.create({
          data: {
            organizationId: orgId,
            name: `${metricName} Live Stream`,
            sourceType: "API",
            description: "Direct stream anomaly ingestion",
            createdById: auth.context.user.id,
          },
        });
        const adHocVersion = await prisma.datasetVersion.create({
          data: {
            datasetId: adHocDataset.id,
            versionNumber: 1,
            fileName: "stream.json",
            fileSizeBytes: 0,
            mimeType: "application/json",
            checksumSha256: "adhoc-stream",
            rowCount: timeSeriesPoints.length,
            columnCount: 2,
            storagePath: "",
            status: "READY",
          },
        });
        targetVersionId = adHocVersion.id;
      }
    }

    const createdAnomalies = [];
    if (targetVersionId) {
      for (const anom of detected) {
        const record = await prisma.anomaly.create({
          data: {
            organizationId: orgId,
            datasetVersionId: targetVersionId,
            metricName,
            timestamp: anom.timestamp,
            observedValue: anom.observedValue,
            expectedValue: anom.expectedValue,
            deviationPct: anom.deviationPct,
            severity: anom.severity,
            detectionMethod: anom.detectionMethod,
            rootCauseJson: JSON.stringify(anom.rootCause),
          },
        });
        createdAnomalies.push(record);

        if (anom.severity === "CRITICAL") {
          await prisma.notification.create({
            data: {
              organizationId: orgId,
              title: `Critical Anomaly Detected in ${metricName}`,
              message: anom.rootCause.factor,
              type: "ANOMALY_ALERT",
              linkUrl: "/anomalies",
            },
          });
        }
      }
    }

    return successResponse({
      detectedCount: detected.length,
      anomalies: detected,
      persistedRecords: createdAnomalies.length,
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to execute anomaly detection.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, "alerts:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { anomalyId, isAcknowledged = true } = body;

    if (!anomalyId) return errorResponse("Missing anomalyId.", 400);

    const existing = await prisma.anomaly.findFirst({
      where: { id: anomalyId, organizationId: orgId }, // STRICT IDOR PREVENTION
    });

    if (!existing) {
      return errorResponse("Anomaly not found in this organization.", 404);
    }

    const updated = await prisma.anomaly.update({
      where: { id: existing.id },
      data: { isAcknowledged },
    });

    return successResponse({ anomaly: updated });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to update anomaly status.", 500);
  }
}
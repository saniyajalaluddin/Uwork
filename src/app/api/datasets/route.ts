import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "datasets:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  const datasets = await prisma.dataset.findMany({
    where: { organizationId: orgId, isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: {
          columns: true,
          validationResult: true,
        },
      },
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const formatted = datasets.map((d) => {
    const latest = d.versions[0];
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      sourceType: d.sourceType,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      createdBy: `${d.createdBy.firstName} ${d.createdBy.lastName}`,
      latestVersion: latest
        ? {
            id: latest.id,
            versionNumber: latest.versionNumber,
            fileName: latest.fileName,
            rowCount: latest.rowCount,
            columnCount: latest.columnCount,
            fileSizeBytes: latest.fileSizeBytes,
            qualityScore: latest.validationResult?.qualityScore ?? 100,
            status: latest.status,
            columns: latest.columns.map((c) => ({
              name: c.name,
              dataType: c.dataType,
              inferredBusinessRole: c.inferredBusinessRole,
              nullCount: c.nullCount,
              uniqueCount: c.uniqueCount,
            })),
          }
        : null,
    };
  });

  return successResponse({ datasets: formatted });
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "datasets:delete");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return errorResponse("Dataset ID is required.", 400);
  }

  // Strictly check tenant boundary
  const dataset = await prisma.dataset.findFirst({
    where: { id, organizationId: orgId, isArchived: false },
  });

  if (!dataset) {
    return errorResponse("Dataset not found.", 404);
  }

  await prisma.dataset.update({
    where: { id: dataset.id },
    data: { isArchived: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      userId: auth.context.user.id,
      action: "DATASET_ARCHIVED",
      resourceType: "DATASET",
      resourceId: dataset.id,
      status: "SUCCESS",
      metadataJson: JSON.stringify({ name: dataset.name }),
    },
  });

  return successResponse({ message: "Dataset archived successfully.", id: dataset.id });
}


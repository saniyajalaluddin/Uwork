import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getTenantDataExport } from "@/services/compliance.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;
  const isDownload = req.nextUrl.searchParams.get("download") === "true";

  try {
    const exportRecord = await getTenantDataExport(orgId, id);

    if (isDownload) {
      const jsonContent = exportRecord.exportDataJson || JSON.stringify(exportRecord.data, null, 2);
      const filename = `uwork-tenant-export-${orgId}-${id}.json`;

      return new NextResponse(jsonContent, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      });
    }

    return successResponse({
      export: exportRecord,
    });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return errorResponse(err.message || "Failed to retrieve data export.", status);
  }
}


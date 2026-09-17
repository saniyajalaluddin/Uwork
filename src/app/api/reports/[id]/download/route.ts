import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { readStorageFile } from "@/lib/storage/storage";
import { errorResponse } from "@/lib/api/response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "reports:read");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const orgId = auth.context.organization.id;

  // Strict tenant boundary check
  const report = await prisma.report.findFirst({
    where: {
      id,
      organizationId: orgId,
    },
  });

  if (!report) {
    return errorResponse("Report not found.", 404);
  }

  try {
    const fileBuffer = await readStorageFile(report.storagePath);
    let contentType = "text/csv";
    if (report.format === "JSON") {
      contentType = "application/json";
    } else if (report.format === "HTML") {
      contentType = "text/html; charset=utf-8";
    }

    const ext = report.format.toLowerCase();
    const filename = `${report.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    return errorResponse("Failed to read report storage file.", 500);
  }
}

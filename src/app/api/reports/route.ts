import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission, enforceRateLimit } from "@/lib/api/middleware";
import { generateReport, deleteReport, ReportType, ReportFormat } from "@/services/report.service";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "reports:write");
  if ("error" in auth) return auth.error;

  const rateLimitCheck = enforceRateLimit(
    req,
    "report_generate",
    { limit: 20, windowMs: 3600000 },
    auth.context.user.id
  );
  if (rateLimitCheck.error) return rateLimitCheck.error;

  const { context } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const format = (["CSV", "JSON", "HTML"].includes(body.format) ? body.format : "CSV") as ReportFormat;
    const type = ([
      "EXECUTIVE_SUMMARY",
      "SALES_DEEP_DIVE",
      "FORECAST_PROJECTION",
      "DATA_QUALITY",
    ].includes(body.type)
      ? body.type
      : "EXECUTIVE_SUMMARY") as ReportType;

    const report = await generateReport({
      organizationId: context.organization.id,
      userId: context.user.id,
      type,
      format,
      title: body.title,
    });

    return successResponse({ report }, 201);
  } catch (err: any) {
    console.error("Report generation error:", err);
    return errorResponse("Failed to generate report.", 500);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "reports:read");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const typeFilter = searchParams.get("type");
  const formatFilter = searchParams.get("format");

  const reports = await prisma.report.findMany({
    where: {
      organizationId: auth.context.organization.id,
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(formatFilter ? { format: formatFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      generatedBy: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });

  return successResponse({ reports });
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "reports:write");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return errorResponse("Report ID is required.", 400);
  }

  const deleted = await deleteReport(auth.context.organization.id, id);
  if (!deleted) {
    return errorResponse("Report not found in this organization.", 404);
  }

  return successResponse({ message: "Report deleted successfully.", id });
}

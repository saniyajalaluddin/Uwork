import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission, enforceRateLimit } from "@/lib/api/middleware";
import { generateExecutiveReport } from "@/services/report.service";
import { readStorageFile } from "@/lib/storage/storage";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "reports:write");
  if ("error" in auth) return auth.error;

  const rateLimitCheck = enforceRateLimit(
    req,
    "report_generate",
    { limit: 10, windowMs: 3600000 },
    auth.context.user.id
  );
  if (rateLimitCheck.error) return rateLimitCheck.error;

  const { context } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const format = (body.format === "JSON" ? "JSON" : "CSV") as "CSV" | "JSON";

    const report = await generateExecutiveReport(
      context.organization.id,
      context.user.id,
      format
    );

    return successResponse(report);
  } catch (err: any) {
    console.error("Report error:", err);
    return errorResponse("Failed to generate report.", 500);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "reports:read");
  if ("error" in auth) return auth.error;

  const reports = await prisma.report.findMany({
    where: { organizationId: auth.context.organization.id },
    orderBy: { createdAt: "desc" },
    include: {
      generatedBy: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });

  return successResponse({ reports });
}


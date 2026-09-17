import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import {
  createReportSchedule,
  listReportSchedules,
  updateReportSchedule,
  deleteReportSchedule,
  ReportType,
} from "@/services/report.service";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "reports:read");
  if ("error" in auth) return auth.error;

  const schedules = await listReportSchedules(auth.context.organization.id);
  return successResponse({ schedules });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "reports:write");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { title, cronExpression, recipients = [], reportType = "EXECUTIVE_SUMMARY" } = body;

    if (!title || typeof title !== "string") {
      return errorResponse("Schedule title is required.", 400);
    }
    if (!cronExpression || typeof cronExpression !== "string") {
      return errorResponse("Valid cronExpression is required.", 400);
    }

    const schedule = await createReportSchedule(auth.context.organization.id, {
      title,
      cronExpression,
      recipients: Array.isArray(recipients) ? recipients : [String(recipients)],
      reportType: reportType as ReportType,
    });

    return successResponse({ schedule }, 201);
  } catch (err: any) {
    console.error("Create schedule error:", err);
    return errorResponse("Failed to create report schedule.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, "reports:write");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { id, title, cronExpression, recipients, reportType, isActive } = body;

    if (!id) {
      return errorResponse("Schedule ID is required.", 400);
    }

    const updated = await updateReportSchedule(auth.context.organization.id, id, {
      title,
      cronExpression,
      recipients,
      reportType,
      isActive,
    });

    if (!updated) {
      return errorResponse("Report schedule not found in this organization.", 404);
    }

    return successResponse({ schedule: updated });
  } catch (err: any) {
    console.error("Update schedule error:", err);
    return errorResponse("Failed to update report schedule.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "reports:write");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return errorResponse("Schedule ID is required.", 400);
  }

  const deleted = await deleteReportSchedule(auth.context.organization.id, id);
  if (!deleted) {
    return errorResponse("Report schedule not found in this organization.", 404);
  }

  return successResponse({ message: "Report schedule deleted successfully.", id });
}

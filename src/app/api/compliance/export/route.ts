import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { listTenantDataExports, createTenantDataExport } from "@/services/compliance.service";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const exports = await listTenantDataExports(orgId);
    return successResponse({ exports });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to list tenant data exports.", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const userId = auth.context.user.id;

  try {
    const exportRecord = await createTenantDataExport(orgId, userId);
    return successResponse(
      {
        message: "Tenant data export archive generated successfully.",
        export: exportRecord,
      },
      201
    );
  } catch (err: any) {
    return errorResponse(err.message || "Failed to generate tenant data export.", 500);
  }
}


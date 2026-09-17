import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { listDatabaseBackups, createDatabaseBackup } from "@/services/backup.service";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  try {
    const backups = await listDatabaseBackups();
    return successResponse({ backups });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to list database backups.", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const userId = auth.context.user.id;

  try {
    const backup = await createDatabaseBackup(userId, "FULL_SNAPSHOT");
    return successResponse(
      {
        message: "Atomic database snapshot backup successfully created and verified.",
        backup,
      },
      201
    );
  } catch (err: any) {
    return errorResponse(err.message || "Failed to create database backup.", 500);
  }
}


import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { verifyBackupIntegrity } from "@/services/backup.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const userId = auth.context.user.id;

  try {
    const result = await verifyBackupIntegrity(id, userId);
    return successResponse({
      message: "Database backup snapshot verified: SQLite magic headers and PRAGMA integrity checks passed.",
      result,
    });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return errorResponse(err.message || "Backup integrity check failed.", status);
  }
}


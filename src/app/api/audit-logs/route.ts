import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { verifyAuditChain, logAuditEvent } from "@/services/audit.service";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const { searchParams } = new URL(req.url);

  const actionFilter = searchParams.get("action");
  const statusFilter = searchParams.get("status");
  const shouldVerify = searchParams.get("verify") === "true";
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

  const whereClause: any = { organizationId: orgId };
  if (actionFilter) whereClause.action = actionFilter;
  if (statusFilter) whereClause.status = statusFilter;

  try {
    const [logs, chainVerification] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { timestamp: "desc" },
        take: limit,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      shouldVerify
        ? verifyAuditChain(orgId, searchParams.get("expectedHeadHash") || undefined)
        : null,
    ]);

    const formattedLogs = logs.map((l) => {
      let chain = null;
      try {
        const meta = JSON.parse(l.metadataJson || "{}");
        chain = meta._auditChain || null;
      } catch {}

      return {
        id: l.id,
        timestamp: l.timestamp,
        action: l.action,
        resourceType: l.resourceType,
        resourceId: l.resourceId,
        status: l.status,
        ipAddress: l.ipAddress,
        userAgent: l.userAgent,
        user: l.user,
        chain,
      };
    });

    return successResponse({
      logs: formattedLogs,
      count: formattedLogs.length,
      chainVerification: chainVerification || {
        checked: false,
        note: "Pass ?verify=true to perform complete cryptographic hash-chain validation.",
      },
    });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to retrieve audit trail.", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { action = "VERIFY_CHAIN" } = body;

    if (action === "VERIFY_CHAIN") {
      const verification = await verifyAuditChain(orgId, body.expectedHeadHash);
      return successResponse({ verification });
    }

    // Generic programmatic audit log emission
    const { resourceType = "SYSTEM", resourceId = orgId, metadata = {}, status = "SUCCESS" } = body;
    const log = await logAuditEvent({
      organizationId: orgId,
      userId: auth.context.user.id,
      action,
      resourceType,
      resourceId,
      status,
      metadata,
    });

    return successResponse({ log });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to process audit operation.", 500);
  }
}

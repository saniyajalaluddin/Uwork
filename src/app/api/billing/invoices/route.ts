import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const invoices = await prisma.subscriptionInvoice.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return successResponse({ invoices });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to fetch invoices.", 500);
  }
}


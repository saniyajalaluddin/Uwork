import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/api/middleware";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  const alerts = await prisma.alert.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });

  return successResponse({ alerts });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { name, metricCode, condition, thresholdValue, cooldownHours = 24 } = body;

    if (!name || !metricCode || !condition || thresholdValue === undefined) {
      return errorResponse("Missing required fields: name, metricCode, condition, thresholdValue.", 400);
    }

    const validConditions = ["GREATER_THAN", "LESS_THAN", "DROPS_BY_PCT", "ANOMALY_DETECTED"];
    if (!validConditions.includes(condition)) {
      return errorResponse(`Invalid condition. Must be one of: ${validConditions.join(", ")}`, 400);
    }

    const alert = await prisma.alert.create({
      data: {
        organizationId: orgId,
        name: String(name).trim(),
        metricCode: String(metricCode).trim(),
        condition,
        thresholdValue: Number(thresholdValue),
        cooldownHours: Math.max(1, Number(cooldownHours) || 24),
        isActive: true,
      },
    });

    return successResponse({ alert }, 201);
  } catch (err: any) {
    return errorResponse("Failed to create alert rule.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;

  try {
    const body = await req.json();
    const { id, isActive, thresholdValue, cooldownHours } = body;

    if (!id) {
      return errorResponse("Missing required alert id.", 400);
    }

    // Verify tenant ownership (IDOR defense)
    const existing = await prisma.alert.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return errorResponse("Alert rule not found in this organization.", 404);
    }

    const updateData: Record<string, any> = {};
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (thresholdValue !== undefined) updateData.thresholdValue = Number(thresholdValue);
    if (cooldownHours !== undefined) updateData.cooldownHours = Math.max(1, Number(cooldownHours));

    const updated = await prisma.alert.update({
      where: { id },
      data: updateData,
    });

    return successResponse({ alert: updated });
  } catch (err: any) {
    return errorResponse("Failed to update alert rule.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const orgId = auth.context.organization.id;
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return errorResponse("Missing required alert id query parameter.", 400);
  }

  // Verify tenant ownership
  const existing = await prisma.alert.findFirst({
    where: { id, organizationId: orgId },
  });

  if (!existing) {
    return errorResponse("Alert rule not found in this organization.", 404);
  }

  await prisma.alert.delete({
    where: { id },
  });

  return successResponse({ message: "Alert rule deleted successfully.", id });
}


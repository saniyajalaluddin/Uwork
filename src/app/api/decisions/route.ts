import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api/middleware";
import {
  listDecisionItems,
  getDecisionItem,
  createDecisionItem,
  updateDecisionStatus,
  deleteDecisionItem,
  synthesizeDecisionsFromAnalytics,
  DecisionStatus,
  DecisionPriority,
  DecisionCategory,
} from "@/services/decision.service";
import { successResponse, errorResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const priority = searchParams.get("priority") || undefined;
  const category = searchParams.get("category") || undefined;
  const id = searchParams.get("id");

  if (id) {
    const item = await getDecisionItem(auth.context.organization.id, id);
    if (!item) return errorResponse("Decision item not found.", 404);
    return successResponse({ item });
  }

  const items = await listDecisionItems(auth.context.organization.id, {
    status,
    priority,
    category,
  });

  return successResponse({ items, count: items.length });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();

    if (body.action === "SYNTHESIZE") {
      const result = await synthesizeDecisionsFromAnalytics(auth.context.organization.id);
      return successResponse({
        message: `Synthesized ${result.synthesizedCount} new decision items.`,
        ...result,
      });
    }

    const {
      title,
      priority = "MEDIUM",
      category = "OPERATIONS",
      impactSummary,
      recommendedAction,
      evidence = {},
    } = body;

    if (!title || typeof title !== "string") {
      return errorResponse("Decision title is required.", 400);
    }
    if (!impactSummary || !recommendedAction) {
      return errorResponse("Both impactSummary and recommendedAction are required.", 400);
    }

    const item = await createDecisionItem(auth.context.organization.id, {
      title,
      priority: priority as DecisionPriority,
      category: category as DecisionCategory,
      impactSummary,
      recommendedAction,
      evidence,
      createdByUserId: auth.context.user.id,
    });

    return successResponse({ item }, 201);
  } catch (err: any) {
    console.error("Create decision error:", err);
    return errorResponse("Failed to create decision item.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, "analytics:read");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { id, status, resolutionNotes } = body;

    if (!id) {
      return errorResponse("Decision ID is required.", 400);
    }
    if (!status) {
      return errorResponse("Status is required.", 400);
    }

    const updated = await updateDecisionStatus(auth.context.organization.id, id, {
      status: status as DecisionStatus,
      resolutionNotes,
      userId: auth.context.user.id,
    });

    if (!updated) {
      return errorResponse("Decision item not found in this organization.", 404);
    }

    return successResponse({ item: updated });
  } catch (err: any) {
    return errorResponse(err.message || "Failed to update decision status.", 400);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, "org:manage");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return errorResponse("Decision ID is required.", 400);
  }

  const deleted = await deleteDecisionItem(auth.context.organization.id, id);
  if (!deleted) {
    return errorResponse("Decision item not found in this organization.", 404);
  }

  return successResponse({ message: "Decision item deleted successfully.", id });
}

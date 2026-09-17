import { NextRequest } from "next/server";
import { requireAuth, enforceRateLimit } from "@/lib/api/middleware";
import { processAssistantQuery } from "@/services/assistant.service";
import { successResponse, errorResponse } from "@/lib/api/response";
import { AppConfig } from "@/config/app.config";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const rateLimitCheck = enforceRateLimit(
    req,
    "assistant_chat",
    AppConfig.rateLimits.assistantChat,
    auth.context.user.id
  );
  if (rateLimitCheck.error) return rateLimitCheck.error;

  try {
    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return errorResponse("Message query is required.", 400);
    }

    const result = await processAssistantQuery(
      auth.context.organization.id,
      message.trim()
    );

    return successResponse(result);
  } catch (err: any) {
    console.error("AI Assistant error:", err);
    return errorResponse("Failed to process assistant query.", 500);
  }
}


import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { verifyStripeSignature, processStripeWebhookEvent } from "@/services/billing.service";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return errorResponse("Missing required 'stripe-signature' header.", 400);
  }

  let event: any;
  try {
    const rawBody = await req.text();
    event = verifyStripeSignature(rawBody, signature);
  } catch (err: any) {
    return errorResponse(`Webhook signature verification failed: ${err.message}`, 400);
  }

  try {
    const result = await processStripeWebhookEvent(event);
    return successResponse({ received: true, ...result });
  } catch (err: any) {
    return errorResponse(err.message || "Error processing webhook event.", 500);
  }
}


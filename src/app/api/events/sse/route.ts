import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/middleware";
import { eventBus, SSEEvent } from "@/lib/events/event-bus";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const { context } = auth;
  const orgId = context.organization.id;
  const userId = context.user.id;

  // Check Last-Event-ID header or query param for reconnection replay
  const lastEventId =
    req.headers.get("last-event-id") ||
    req.nextUrl.searchParams.get("lastEventId") ||
    null;

  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Initial Handshake
      const initialPayload = {
        status: "connected",
        organizationId: orgId,
        userId,
        timestamp: new Date().toISOString(),
      };
      controller.enqueue(
        encoder.encode(
          `id: init_${Date.now()}\nevent: CONNECTED\ndata: ${JSON.stringify(initialPayload)}\n\n`
        )
      );

      // 2. Replay buffered events missed during network interruption
      if (lastEventId) {
        const missedEvents = eventBus.getEventsSince(orgId, lastEventId);
        for (const evt of missedEvents) {
          controller.enqueue(
            encoder.encode(
              `id: ${evt.id}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`
            )
          );
        }
      }

      // 3. Subscribe to Real-Time Event Bus
      unsubscribe = eventBus.subscribe(orgId, userId, (event: SSEEvent) => {
        try {
          const message = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (err) {
          logger.warn("Failed to enqueue SSE event to client stream", { error: err });
        }
      });

      // 4. Heartbeat keep-alive (every 15 seconds)
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch (err) {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, 15000);
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (unsubscribe) unsubscribe();
    },
  });

  // Clean up if client terminates connection abruptly
  req.signal.addEventListener("abort", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (unsubscribe) unsubscribe();
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

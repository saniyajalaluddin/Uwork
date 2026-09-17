import { NextResponse } from "next/server";
import crypto from "crypto";
import { getRequestContext } from "../observability/context";
import { logger } from "../observability/logger";
import { incrementCounter, recordDuration } from "../observability/metrics";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    durationMs?: number;
  };
}

/**
 * Resolves the active or generated correlation ID for this response
 */
function resolveCorrelationId(customRequestId?: string): string {
  if (customRequestId) return customRequestId;
  const ctx = getRequestContext();
  if (ctx?.correlationId) return ctx.correlationId;
  return `req_${crypto.randomUUID()}`;
}

export function successResponse<T>(data: T, status = 200, meta?: Record<string, any>) {
  const reqContext = getRequestContext();
  const requestId = resolveCorrelationId(meta?.requestId);
  const now = Date.now();
  const durationMs = reqContext?.startTime ? now - reqContext.startTime : undefined;

  // Track telemetry metrics
  incrementCounter("http_requests_total", 1, {
    status: String(status),
    success: "true",
  });
  if (durationMs !== undefined) {
    recordDuration("http_request_duration_ms", durationMs, {
      status: String(status),
    });
  }

  const response = NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...meta,
      },
    },
    { status }
  );

  response.headers.set("x-request-id", requestId);
  response.headers.set("x-correlation-id", requestId);

  return response;
}

export function errorResponse(
  message: string,
  status = 400,
  code = "BAD_REQUEST",
  details: any = null
) {
  const reqContext = getRequestContext();
  const requestId = resolveCorrelationId();
  const now = Date.now();
  const durationMs = reqContext?.startTime ? now - reqContext.startTime : undefined;

  // Track telemetry metrics
  incrementCounter("http_requests_total", 1, {
    status: String(status),
    code,
    success: "false",
  });
  if (durationMs !== undefined) {
    recordDuration("http_request_duration_ms", durationMs, {
      status: String(status),
    });
  }

  // Structured Logging based on severity
  if (status >= 500) {
    logger.error(`[HTTP ${status}] ${code}: ${message}`, {
      code,
      details,
      correlationId: requestId,
      durationMs,
    });
  } else if (status === 401 || status === 403 || status === 429) {
    logger.warn(`[HTTP ${status}] ${code}: ${message}`, {
      code,
      details,
      correlationId: requestId,
      durationMs,
    });
  } else {
    logger.debug(`[HTTP ${status}] ${code}: ${message}`, {
      code,
      details,
      correlationId: requestId,
    });
  }

  const response = NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        ...(durationMs !== undefined ? { durationMs } : {}),
      },
    },
    { status }
  );

  response.headers.set("x-request-id", requestId);
  response.headers.set("x-correlation-id", requestId);

  return response;
}

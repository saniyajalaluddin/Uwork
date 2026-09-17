import { NextRequest } from "next/server";
import { validateSession } from "../auth/session";
import { hasPermission, Permission, Role } from "../security/rbac";
import { checkRateLimit, RateLimitOptions, getRateLimitHeaders } from "../security/rate-limiter";
import { errorResponse } from "./response";
import {
  extractOrGenerateCorrelationId,
  updateRequestContext,
  runWithContext,
  RequestContext,
} from "../observability/context";

export interface AuthenticatedContext {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    isActive: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    planTier: string;
  };
  role: Role;
  sessionId: string;
}

export async function getAuthContext(
  req: NextRequest
): Promise<AuthenticatedContext | null> {
  const token = req.cookies.get("uwork_session")?.value;
  if (!token) return null;

  const auth = await validateSession(token);
  if (!auth) return null;

  return auth as AuthenticatedContext;
}

export async function requireAuth(
  req: NextRequest
): Promise<{ context: AuthenticatedContext } | { error: Response }> {
  const incomingId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id");
  const correlationId = extractOrGenerateCorrelationId(incomingId);
  updateRequestContext({ correlationId });

  const auth = await getAuthContext(req);
  if (!auth) {
    return {
      error: errorResponse("Authentication required. Please log in.", 401, "UNAUTHORIZED"),
    };
  }

  updateRequestContext({
    correlationId,
    organizationId: auth.organization.id,
    userId: auth.user.id,
  });

  return { context: auth };
}

export async function requirePermission(
  req: NextRequest,
  permission: Permission
): Promise<{ context: AuthenticatedContext } | { error: Response }> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult;

  const { context } = authResult;
  if (!hasPermission(context.role, permission)) {
    return {
      error: errorResponse(
        `Forbidden: Role '${context.role}' does not have '${permission}' permission.`,
        403,
        "FORBIDDEN"
      ),
    };
  }

  return { context };
}

export function enforceRateLimit(
  req: NextRequest,
  actionKey: string,
  options?: RateLimitOptions,
  userId?: string
): { error?: Response; headers?: Record<string, string> } {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  // Use user ID if authenticated, else use client IP
  const principal = userId ? `user:${userId}` : `ip:${ip}`;
  const identifier = `${actionKey}:${principal}`;

  // Check for environment variable override
  const envLimit = process.env[`RATE_LIMIT_${actionKey.toUpperCase()}_MAX`];
  const effectiveLimit = envLimit ? parseInt(envLimit, 10) : options?.limit;

  const resolvedOptions: RateLimitOptions = {
    limit: effectiveLimit || options?.limit || 100,
    windowMs: options?.windowMs || 60000,
  };

  const result = checkRateLimit(identifier, resolvedOptions);
  const rateLimitHeaders = getRateLimitHeaders(result);

  if (!result.allowed) {
    const errorRes = errorResponse(
      "Too many requests. Please slow down and try again later.",
      429,
      "RATE_LIMIT_EXCEEDED",
      {
        resetInSeconds: result.retryAfterSeconds || Math.ceil((result.resetTime - Date.now()) / 1000),
      }
    );

    for (const [header, val] of Object.entries(rateLimitHeaders)) {
      errorRes.headers.set(header, val);
    }

    return { error: errorRes, headers: rateLimitHeaders };
  }

  return { headers: rateLimitHeaders };
}

/**
 * Wraps an asynchronous route execution block with request-scoped tracing context.
 */
export async function withObservability<T>(
  req: NextRequest,
  handler: (context: RequestContext) => Promise<T>
): Promise<T> {
  const incomingId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id");
  const correlationId = extractOrGenerateCorrelationId(incomingId);
  const context: RequestContext = {
    correlationId,
    method: req.method,
    route: req.nextUrl?.pathname || req.url,
    startTime: Date.now(),
  };
  return runWithContext(context, () => handler(context));
}



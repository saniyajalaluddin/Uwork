import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "crypto";

export interface RequestContext {
  correlationId: string;
  organizationId?: string;
  userId?: string;
  route?: string;
  method?: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current request context from AsyncLocalStorage if inside a request lifecycle.
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Executes a function within the specified request context.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Extracts correlation ID from request headers or generates a new trace token.
 */
export function extractOrGenerateCorrelationId(headerValue?: string | null): string {
  if (headerValue && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  return `req_${crypto.randomUUID()}`;
}

/**
 * Mutates or attaches context fields to the active store.
 */
export function updateRequestContext(updates: Partial<RequestContext>): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    Object.assign(store, updates);
  }
}


/**
 * UWORK Enterprise Sliding Window Rate Limiter
 * 
 * Provides:
 * 1. Sliding window timestamp log (prevents boundary double-spend burst attacks)
 * 2. Capped LRU-style eviction (prevents memory exhaustion from IP spoofing)
 * 3. RFC-compliant HTTP rate limit header generation
 * 4. Configurable environment variable overrides
 */

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfterSeconds?: number;
}

import { AppConfig } from "../../config/app.config";

interface SlidingLogEntry {
  timestamps: number[];
  lastAccessed: number;
}

const MAX_RATE_LIMIT_ENTRIES = AppConfig.cache.rateLimiterMaxEntries;
const memoryStore = new Map<string, SlidingLogEntry>();

/**
 * Clean up expired entries to prevent memory leaks
 */
function evictOldestOrExpired(now: number) {
  // If store is within limits, only clean up if needed
  if (memoryStore.size <= MAX_RATE_LIMIT_ENTRIES) {
    return;
  }

  // Evict expired entries first
  for (const [key, entry] of memoryStore.entries()) {
    const activeTimestamps = entry.timestamps.filter((ts) => ts > now - 3600000);
    if (activeTimestamps.length === 0) {
      memoryStore.delete(key);
    }
  }

  // If still above threshold, evict oldest accessed
  if (memoryStore.size > MAX_RATE_LIMIT_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of memoryStore.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      memoryStore.delete(oldestKey);
    }
  }
}

/**
 * Check rate limit using an exact sliding window log algorithm
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { limit: 100, windowMs: 60000 }
): RateLimitResult {
  const now = Date.now();
  evictOldestOrExpired(now);

  let entry = memoryStore.get(identifier);

  if (!entry) {
    entry = { timestamps: [], lastAccessed: now };
    memoryStore.set(identifier, entry);
  }

  entry.lastAccessed = now;

  // Filter out timestamps outside the current sliding window
  const windowStart = now - options.windowMs;
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= options.limit) {
    const oldestInWindow = entry.timestamps[0] || now;
    const resetTime = oldestInWindow + options.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));

    return {
      allowed: false,
      limit: options.limit,
      remaining: 0,
      resetTime,
      retryAfterSeconds,
    };
  }

  // Allow request and record timestamp
  entry.timestamps.push(now);
  const remaining = options.limit - entry.timestamps.length;
  const oldestInWindow = entry.timestamps[0];
  const resetTime = oldestInWindow + options.windowMs;

  return {
    allowed: true,
    limit: options.limit,
    remaining,
    resetTime,
  };
}

/**
 * Generate standard RFC rate limit headers
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(result.resetTime / 1000)),
  };

  if (!result.allowed && result.retryAfterSeconds) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

/**
 * Clear rate limit store (for test suites)
 */
export function clearRateLimits(): void {
  memoryStore.clear();
}

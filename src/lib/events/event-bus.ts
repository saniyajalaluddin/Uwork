import { EventEmitter } from "events";
import crypto from "crypto";
import { incrementCounter } from "../observability/metrics";
import { logger } from "../observability/logger";

export type SSEEventType =
  | "CONNECTED"
  | "HEARTBEAT"
  | "NOTIFICATION"
  | "ALERT_TRIGGERED"
  | "DATASET_READY"
  | "JOB_PROGRESS"
  | "FORECAST_COMPLETED"
  | "ANOMALY_ALERT"
  | "HEALTH_SCORE_UPDATED"
  | "REPORT_READY"
  | "DECISION_UPDATED"
  | "MEMBER_UPDATED"
  | "ORGANIZATION_UPDATED";

export interface SSEEvent<T = any> {
  id: string;
  type: SSEEventType;
  timestamp: string;
  organizationId: string;
  userId?: string;
  data: T;
}

export type EventCallback = (event: SSEEvent) => void;

class MultiTenantEventBus {
  private emitter = new EventEmitter();
  // In-memory replay buffer for SSE reconnection recovery (max 50 events per tenant)
  private tenantBuffers = new Map<string, SSEEvent[]>();
  private readonly MAX_BUFFER_PER_TENANT = 50;

  constructor() {
    // Increase listener limits for high-concurrency multi-tab enterprise users
    this.emitter.setMaxListeners(500);
  }

  private getTenantChannel(orgId: string): string {
    return `tenant:${orgId}`;
  }

  private getUserChannel(orgId: string, userId: string): string {
    return `user:${orgId}:${userId}`;
  }

  /**
   * Subscribes a client listener to tenant-wide and optional user-specific events.
   */
  public subscribe(
    organizationId: string,
    userId: string | undefined,
    callback: EventCallback
  ): () => void {
    const tenantChan = this.getTenantChannel(organizationId);
    this.emitter.on(tenantChan, callback);

    let userChan: string | null = null;
    if (userId) {
      userChan = this.getUserChannel(organizationId, userId);
      this.emitter.on(userChan, callback);
    }

    incrementCounter("sse_active_subscribers", 1, { organizationId });

    return () => {
      this.emitter.off(tenantChan, callback);
      if (userChan) {
        this.emitter.off(userChan, callback);
      }
      incrementCounter("sse_active_subscribers", -1, { organizationId });
    };
  }

  /**
   * Publishes an event to all connected listeners in a tenant organization.
   */
  public publishToTenant<T>(
    organizationId: string,
    type: SSEEventType,
    data: T
  ): SSEEvent<T> {
    const event: SSEEvent<T> = {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      type,
      timestamp: new Date().toISOString(),
      organizationId,
      data,
    };

    // Buffer for reconnection replay
    let buffer = this.tenantBuffers.get(organizationId);
    if (!buffer) {
      buffer = [];
      this.tenantBuffers.set(organizationId, buffer);
    }
    buffer.push(event);
    if (buffer.length > this.MAX_BUFFER_PER_TENANT) {
      buffer.shift();
    }

    const channel = this.getTenantChannel(organizationId);
    this.emitter.emit(channel, event);

    incrementCounter("sse_events_published_total", 1, { type });
    return event;
  }

  /**
   * Publishes an event targeted at a specific user in an organization.
   */
  public publishToUser<T>(
    organizationId: string,
    userId: string,
    type: SSEEventType,
    data: T
  ): SSEEvent<T> {
    const event: SSEEvent<T> = {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      type,
      timestamp: new Date().toISOString(),
      organizationId,
      userId,
      data,
    };

    const channel = this.getUserChannel(organizationId, userId);
    this.emitter.emit(channel, event);

    incrementCounter("sse_events_published_total", 1, { type });
    return event;
  }

  /**
   * Retrieves buffered events that occurred after the given lastEventId for reconnection recovery.
   */
  public getEventsSince(organizationId: string, lastEventId: string): SSEEvent[] {
    const buffer = this.tenantBuffers.get(organizationId);
    if (!buffer || buffer.length === 0) return [];

    const index = buffer.findIndex((e) => e.id === lastEventId);
    if (index === -1) {
      // If lastEventId is older than buffer window, return all buffered events
      return [...buffer];
    }
    return buffer.slice(index + 1);
  }

  /**
   * Resets buffers (used for testing or maintenance)
   */
  public clearBuffers(): void {
    this.tenantBuffers.clear();
  }
}

declare global {
  var globalEventBus: MultiTenantEventBus | undefined;
}

export const eventBus = global.globalEventBus || new MultiTenantEventBus();

if (process.env.NODE_ENV !== "production") {
  global.globalEventBus = eventBus;
}

export default eventBus;


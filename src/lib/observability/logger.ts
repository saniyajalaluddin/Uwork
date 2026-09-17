import { getRequestContext } from "./context";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component?: string;
  correlationId?: string;
  organizationId?: string;
  userId?: string;
  durationMs?: number;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, any>;
}

export interface LoggerOptions {
  component?: string;
  defaultMetadata?: Record<string, any>;
}

// In-memory ring buffer for observability snapshots and unit testing
const MAX_LOG_BUFFER_SIZE = 1000;
const logBuffer: LogEntry[] = [];

function getActiveLogLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL || "").toUpperCase();
  if (envLevel in LOG_LEVEL_PRIORITIES) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === "production" ? "INFO" : "DEBUG";
}

export class StructuredLogger {
  private component?: string;
  private defaultMetadata?: Record<string, any>;

  constructor(options?: LoggerOptions) {
    this.component = options?.component;
    this.defaultMetadata = options?.defaultMetadata;
  }

  public child(options: LoggerOptions): StructuredLogger {
    return new StructuredLogger({
      component: options.component || this.component,
      defaultMetadata: {
        ...this.defaultMetadata,
        ...options.defaultMetadata,
      },
    });
  }

  private log(
    level: LogLevel,
    message: string,
    metadataOrError?: Record<string, any> | Error,
    durationMs?: number
  ): LogEntry | null {
    const minLevel = getActiveLogLevel();
    if (LOG_LEVEL_PRIORITIES[level] < LOG_LEVEL_PRIORITIES[minLevel]) {
      return null;
    }

    const reqContext = getRequestContext();
    const timestamp = new Date().toISOString();

    let errorObj: LogEntry["error"] | undefined;
    let metadata: Record<string, any> | undefined = { ...this.defaultMetadata };

    if (metadataOrError instanceof Error) {
      errorObj = {
        message: metadataOrError.message,
        stack: metadataOrError.stack,
        code: (metadataOrError as any).code || "INTERNAL_ERROR",
      };
    } else if (metadataOrError && typeof metadataOrError === "object") {
      if (metadataOrError.error instanceof Error) {
        errorObj = {
          message: metadataOrError.error.message,
          stack: metadataOrError.error.stack,
          code: (metadataOrError.error as any).code,
        };
        const { error, ...rest } = metadataOrError;
        metadata = { ...metadata, ...rest };
      } else {
        metadata = { ...metadata, ...metadataOrError };
      }
    }

    const entry: LogEntry = {
      timestamp,
      level,
      message,
      component: this.component,
      correlationId: reqContext?.correlationId,
      organizationId: reqContext?.organizationId,
      userId: reqContext?.userId,
      durationMs,
      error: errorObj,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };

    // Store in circular telemetry buffer
    if (logBuffer.length >= MAX_LOG_BUFFER_SIZE) {
      logBuffer.shift();
    }
    logBuffer.push(entry);

    // Formatted stdout in production (JSON) / development (human-readable)
    if (process.env.NODE_ENV !== "test" || process.env.ENABLE_TEST_LOGS === "true") {
      if (process.env.NODE_ENV === "production") {
        console.log(JSON.stringify(entry));
      } else {
        const tag = `[${level}]`.padEnd(7);
        const comp = this.component ? `[${this.component}] ` : "";
        const cid = entry.correlationId ? `(${entry.correlationId}) ` : "";
        const dur = durationMs !== undefined ? ` [${durationMs.toFixed(1)}ms]` : "";
        console.log(`${entry.timestamp} ${tag} ${comp}${cid}${message}${dur}`);
        if (errorObj?.stack) {
          console.error(errorObj.stack);
        }
      }
    }

    return entry;
  }

  public debug(message: string, metadata?: Record<string, any>): LogEntry | null {
    return this.log("DEBUG", message, metadata);
  }

  public info(message: string, metadata?: Record<string, any>, durationMs?: number): LogEntry | null {
    return this.log("INFO", message, metadata, durationMs);
  }

  public warn(message: string, metadataOrError?: Record<string, any> | Error): LogEntry | null {
    return this.log("WARN", message, metadataOrError);
  }

  public error(
    message: string,
    metadataOrError?: Record<string, any> | Error,
    durationMs?: number
  ): LogEntry | null {
    return this.log("ERROR", message, metadataOrError, durationMs);
  }

  public fatal(
    message: string,
    metadataOrError?: Record<string, any> | Error
  ): LogEntry | null {
    return this.log("FATAL", message, metadataOrError);
  }
}

export const logger = new StructuredLogger({ component: "App" });

export function getRecentLogs(filter?: {
  level?: LogLevel;
  component?: string;
  correlationId?: string;
  organizationId?: string;
}): LogEntry[] {
  let result = [...logBuffer];
  if (filter?.level) {
    result = result.filter((l) => l.level === filter.level);
  }
  if (filter?.component) {
    result = result.filter((l) => l.component === filter.component);
  }
  if (filter?.correlationId) {
    result = result.filter((l) => l.correlationId === filter.correlationId);
  }
  if (filter?.organizationId) {
    result = result.filter((l) => l.organizationId === filter.organizationId);
  }
  return result;
}

export function clearLogBuffer(): void {
  logBuffer.length = 0;
}


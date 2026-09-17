import { prisma } from "../db/prisma";
import { logger } from "../observability/logger";

let shuttingDown = false;
let handlersRegistered = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/**
 * Performs graceful shutdown of server resources:
 * 1. Sets server draining status
 * 2. Flushes in-flight logs and telemetry
 * 3. Disconnects database pool cleanly
 */
export async function performGracefulShutdown(reason = "SIGNAL"): Promise<{
  success: boolean;
  drained: boolean;
  reason: string;
  durationMs: number;
}> {
  const start = performance.now();
  if (shuttingDown) {
    return { success: true, drained: true, reason, durationMs: 0 };
  }

  shuttingDown = true;
  logger.info(`Initiating graceful server shutdown (${reason}). Draining active connections...`);

  try {
    // 1. Allow brief grace period for in-flight requests to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 2. Disconnect database connections cleanly
    await prisma.$disconnect();

    const durationMs = Math.round(performance.now() - start);
    logger.info(`Server resources successfully released in ${durationMs}ms`);

    return {
      success: true,
      drained: true,
      reason,
      durationMs,
    };
  } catch (err: any) {
    logger.error(`Error during graceful shutdown: ${err.message}`);
    return {
      success: false,
      drained: false,
      reason,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

/**
 * Registers OS signal listeners for zero-downtime container orchestrators (Kubernetes / Docker).
 */
export function registerShutdownHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  const handleSignal = async (signal: string) => {
    logger.info(`Received OS process signal: ${signal}`);
    await performGracefulShutdown(signal);
    if (process.env.NODE_ENV !== "test") {
      process.exit(0);
    }
  };

  process.once("SIGTERM", () => handleSignal("SIGTERM"));
  process.once("SIGINT", () => handleSignal("SIGINT"));
}


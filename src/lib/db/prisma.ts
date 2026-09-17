import { PrismaClient } from "@prisma/client";
import { incrementCounter, recordDuration } from "../observability/metrics";
import { logger } from "../observability/logger";

function createPrismaClient() {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = performance.now();
          const modelName = model || "unknown";
          try {
            const result = await query(args);
            const durationMs = performance.now() - start;
            incrementCounter("db_queries_total", 1, { model: modelName, operation });
            recordDuration("db_query_duration_ms", durationMs, { model: modelName, operation });
            if (durationMs > 150) {
              logger.warn(`Slow database query: ${modelName}.${operation} took ${durationMs.toFixed(1)}ms`, {
                model: modelName,
                operation,
                durationMs,
              });
            }
            return result;
          } catch (error) {
            incrementCounter("db_queries_errors_total", 1, { model: modelName, operation });
            throw error;
          }
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  var prismaClientInstance: ExtendedPrismaClient | undefined;
}

export const prisma = global.prismaClientInstance || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaClientInstance = prisma;
}

export default prisma;

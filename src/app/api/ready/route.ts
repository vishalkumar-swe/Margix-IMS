import { prisma } from "@/server/db/client";
import { logger } from "@/server/observability/logger";

/**
 * Readiness probe: the app can serve traffic, i.e. the database answers.
 * Returns 503 otherwise so load balancers stop routing to this instance.
 */
export async function GET() {
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ready", database: "ok", databaseLatencyMs: Math.round(performance.now() - startedAt) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    logger.error("readiness check failed", { err: error });
    return Response.json(
      { status: "unavailable", database: "unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

import { createServer } from "node:http";
import { app } from "./app";
import { prisma } from "./db";
import { env } from "./env";
import { logger } from "./lib/logger";
import { initRealtime } from "./realtime";

const server = createServer(app);
initRealtime(server);

server.listen(env.port, () => {
  logger.info(
    { port: env.port, environment: env.nodeEnv, clientOrigins: env.clientOrigins },
    "TeamFlow API listening",
  );
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

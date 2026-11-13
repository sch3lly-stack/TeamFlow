import { PrismaClient } from "@prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.nodeEnv === "production" ? ["error"] : ["warn", "error"],
  });

if (!env.isProd) globalForPrisma.prisma = prisma;

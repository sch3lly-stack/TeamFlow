import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "./db";
import { env } from "./env";
import { ACCESS_COOKIE } from "./lib/cookies";
import { logger } from "./lib/logger";
import { verifyAccessToken } from "./lib/tokens";

let io: Server | null = null;

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: env.socketOrigins,
      credentials: true,
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 1e6,
  });

  io.use(async (socket, next) => {
    try {
      const authToken =
        typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
      const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE) ?? authToken;
      if (!token) return next(new Error("unauthorized"));

      const userId = verifyAccessToken(token);
      if (!userId) return next(new Error("unauthorized"));

      const memberships = await prisma.membership.findMany({
        where: { userId },
        select: { organizationId: true },
      });
      if (memberships.length === 0) return next(new Error("forbidden"));

      socket.data.userId = userId;
      socket.data.organizationIds = memberships.map((membership) => membership.organizationId);
      next();
    } catch (error) {
      logger.warn({ err: error }, "socket authentication failed");
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    const organizationIds = (socket.data.organizationIds as string[]) ?? [];

    socket.join(`user:${userId}`);
    for (const organizationId of organizationIds) {
      socket.join(`org:${organizationId}`);
    }

    socket.emit("connected", { userId, organizationIds });
  });

  return io;
}

export function getIo(): Server | null {
  return io;
}

export function emitToOrg(organizationId: string, event: string, payload: unknown): void {
  io?.to(`org:${organizationId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function closeRealtime(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) return resolve();
    io.close(() => {
      io = null;
      resolve();
    });
  });
}

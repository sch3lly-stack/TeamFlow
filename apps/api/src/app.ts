import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { prisma } from "./db";
import { env } from "./env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/errors";
import { apiRateLimiter } from "./middleware/rateLimit";
import { csrfProtection, originCheck } from "./middleware/security";
import { attachmentsRouter } from "./routes/attachments";
import { authRouter } from "./routes/auth";
import { invitationsRouter } from "./routes/invitations";
import { notificationsRouter } from "./routes/notifications";
import { organizationsRouter } from "./routes/organizations";
import { peopleRouter } from "./routes/people";
import { orgProjectsRouter, projectsRouter } from "./routes/projects";
import { projectSprintsRouter, sprintsRouter } from "./routes/sprints";
import { projectTasksRouter, tasksRouter } from "./routes/tasks";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (env.isProd) app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
      exposedHeaders: ["Content-Disposition"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.nodeEnv !== "test",
    }),
  );
  app.use(originCheck);
  app.use("/api", apiRateLimiter);
  app.use("/api", csrfProtection);

  app.get("/api/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "degraded", database: "unavailable" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/invitations", invitationsRouter);
  app.use("/api/organizations", organizationsRouter);
  app.use("/api/organizations", peopleRouter);
  app.use("/api/organizations", orgProjectsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/projects/:projectId/tasks", projectTasksRouter);
  app.use("/api/projects/:projectId/sprints", projectSprintsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/sprints", sprintsRouter);
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/notifications", notificationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? `File exceeds the ${Math.round(env.maxUploadBytes / (1024 * 1024))}MB limit`
        : "File upload failed";
    res.status(400).json({ error: { code: "UPLOAD_ERROR", message } });
    return;
  }

  const code = (error as { code?: string }).code;
  if (code === "P2002") {
    res.status(409).json({
      error: { code: "CONFLICT", message: "A record with that value already exists" },
    });
    return;
  }
  if (code === "P2025") {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
    return;
  }

  logger.error({ err: error, path: req.path, method: req.method }, "Unhandled request error");

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: env.isProd ? "Something went wrong" : String((error as Error)?.message ?? error),
    },
  });
};

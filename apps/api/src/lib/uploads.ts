import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import multer from "multer";
import { env } from "../env";
import { AppError } from "./errors";

mkdirSync(env.uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned || "attachment";
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, env.uploadDir),
  filename: (_req, _file, callback) => callback(null, randomUUID()),
});

export const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new AppError(
          400,
          "UNSUPPORTED_FILE_TYPE",
          "That file type is not allowed. Upload images, PDFs, text, CSV, JSON, ZIP or Office documents.",
        ),
      );
    }
    callback(null, true);
  },
});

export const ALLOWED_UPLOAD_TYPES = [...ALLOWED_MIME_TYPES];

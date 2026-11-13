import path from "node:path";
import { config } from "dotenv";
import { z } from "zod";

config({ path: path.resolve(process.cwd(), "../../.env") });
config();

const optionalBoolean = z
  .string()
  .optional()
  .transform((value) => (value === undefined ? undefined : value.toLowerCase() === "true"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  SOCKET_CORS_ORIGIN: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16).optional(),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: optionalBoolean,
  COOKIE_DOMAIN: z.string().optional(),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(10),
  RATE_LIMIT_DISABLED: optionalBoolean,
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === "production";

if (isProd && !raw.JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET must be set in production");
}

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProd,
  port: raw.PORT,
  databaseUrl: raw.DATABASE_URL,
  clientOrigins: raw.CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  socketOrigins:
    raw.SOCKET_CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) ??
    raw.CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  jwtAccessSecret: raw.JWT_ACCESS_SECRET ?? "development-only-insecure-secret-change-me",
  accessTtlMinutes: raw.ACCESS_TOKEN_TTL_MINUTES,
  refreshTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
  cookieSecure: raw.COOKIE_SECURE ?? isProd,
  cookieDomain: raw.COOKIE_DOMAIN || undefined,
  uploadDir: path.resolve(process.cwd(), raw.UPLOAD_DIR),
  maxUploadBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,
  rateLimitDisabled: raw.RATE_LIMIT_DISABLED ?? raw.NODE_ENV === "test",
  authRateLimitMax: raw.AUTH_RATE_LIMIT_MAX,
};

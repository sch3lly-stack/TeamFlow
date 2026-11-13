import type { RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { CSRF_COOKIE, CSRF_HEADER } from "../lib/cookies";
import { AppError, forbidden } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
]);

/** Reject cross-origin state-changing requests before they reach a handler. */
export const originCheck: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get("origin");
  if (origin && !env.clientOrigins.includes(origin)) {
    return next(forbidden("Request origin is not allowed"));
  }
  next();
};

/**
 * Double-submit CSRF protection for cookie-authenticated requests.
 * Bearer-token API clients are not vulnerable to browser CSRF and are skipped.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const pathname = req.originalUrl.split("?")[0] ?? req.path;
  if (CSRF_EXEMPT_PATHS.has(pathname)) return next();
  if (req.get("authorization")?.startsWith("Bearer ")) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken) {
    return next(new AppError(403, "CSRF_MISSING", "Missing CSRF token"));
  }

  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return next(new AppError(403, "CSRF_INVALID", "Invalid CSRF token"));
  }
  next();
};

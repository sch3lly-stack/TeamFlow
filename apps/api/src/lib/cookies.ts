import type { CookieOptions, Response } from "express";
import { randomBytes } from "node:crypto";
import { env } from "../env";

export const ACCESS_COOKIE = "tf_access";
export const REFRESH_COOKIE = "tf_refresh";
export const CSRF_COOKIE = "tf_csrf";
export const CSRF_HEADER = "x-csrf-token";

function baseOptions(): CookieOptions {
  return {
    sameSite: "lax",
    secure: env.cookieSecure,
    domain: env.cookieDomain,
  };
}

export function setCsrfCookie(res: Response): string {
  const token = randomBytes(24).toString("base64url");
  res.cookie(CSRF_COOKIE, token, {
    ...baseOptions(),
    httpOnly: false,
    path: "/",
    maxAge: env.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
  return token;
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): string {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    httpOnly: true,
    path: "/",
    maxAge: env.accessTtlMinutes * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    httpOnly: true,
    path: "/api/auth",
    maxAge: env.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
  return setCsrfCookie(res);
}

export function clearAuthCookies(res: Response): void {
  const options = { ...baseOptions(), path: "/" };
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(CSRF_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: "/api/auth" });
}

export function getBearerOrCookieToken(
  authorization: string | undefined,
  cookieToken: string | undefined,
): { token: string; source: "bearer" | "cookie" } | null {
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return { token, source: "bearer" };
  }
  if (cookieToken) return { token: cookieToken, source: "cookie" };
  return null;
}

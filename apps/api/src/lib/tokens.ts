import { createHash, randomBytes } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../env";

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, iss: "teamflow" }, env.jwtAccessSecret, {
    expiresIn: env.accessTtlMinutes * 60,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret, {
      algorithms: ["HS256"],
      issuer: "teamflow",
    }) as JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(48).toString("base64url");
  return {
    raw,
    hash: hashRefreshToken(raw),
    expiresAt: new Date(Date.now() + env.refreshTtlDays * 24 * 60 * 60 * 1000),
  };
}

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

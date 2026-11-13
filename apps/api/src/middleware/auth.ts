import type { RequestHandler } from "express";
import { prisma } from "../db";
import { ACCESS_COOKIE, getBearerOrCookieToken } from "../lib/cookies";
import { asyncHandler, unauthorized } from "../lib/errors";
import { verifyAccessToken } from "../lib/tokens";

export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const resolved = getBearerOrCookieToken(req.get("authorization"), req.cookies?.[ACCESS_COOKIE]);
  if (!resolved) throw unauthorized();

  const userId = verifyAccessToken(resolved.token);
  if (!userId) throw unauthorized("Your session has expired");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarColor: true, timezone: true },
  });
  if (!user) throw unauthorized();

  req.user = user;
  next();
});

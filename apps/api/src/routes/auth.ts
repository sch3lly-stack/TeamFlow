import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import {
  AVATAR_COLORS,
  DEFAULT_ORG_SETTINGS,
  DEFAULT_TASK_CATEGORIES,
  randomAvatarColor,
} from "../domain/defaults";
import { asyncHandler, badRequest, conflict, unauthorized } from "../lib/errors";
import {
  CSRF_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
  setCsrfCookie,
} from "../lib/cookies";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/password";
import { generateUniqueSlug } from "../lib/slug";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "../lib/tokens";
import { authenticate } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimit";
import { parseBody } from "../middleware/validate";
import { recordAudit } from "../services/audit";
import { loadUserPayload } from "../services/users";

export const authRouter = Router();

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200, "Password is too long");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
  organizationName: z.string().trim().min(2).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(200),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Avatar color must be a hex color")
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

async function establishSession(
  res: Parameters<typeof setAuthCookies>[0],
  userId: string,
  req: Parameters<typeof recordAudit>[0],
): Promise<string> {
  const refresh = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: req.get("user-agent")?.slice(0, 400),
      ip: req.ip?.slice(0, 90),
    },
  });
  const accessToken = signAccessToken(userId);
  return setAuthCookies(res, accessToken, refresh.raw);
}

authRouter.post(
  "/register",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req.body);

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict("An account with that email already exists");

    const passwordHash = hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          avatarColor: randomAvatarColor(),
        },
      });

      if (input.organizationName) {
        const slug = await generateUniqueSlug(tx, input.organizationName);
        const organization = await tx.organization.create({
          data: {
            name: input.organizationName,
            slug,
            settings: DEFAULT_ORG_SETTINGS,
            logoColor: AVATAR_COLORS[0],
          },
        });
        await tx.membership.create({
          data: {
            userId: created.id,
            organizationId: organization.id,
            role: "OWNER",
            title: "Owner",
          },
        });
        await tx.taskCategory.createMany({
          data: DEFAULT_TASK_CATEGORIES.map((category) => ({
            ...category,
            organizationId: organization.id,
          })),
        });
      }

      return created;
    });

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarColor: user.avatarColor,
      timezone: user.timezone,
    };

    const csrfToken = await establishSession(res, user.id, req);
    await recordAudit(req, { action: "auth.register", entityType: "User", entityId: user.id });

    const payload = await loadUserPayload(user.id);
    res.status(201).json({ user: payload, csrfToken });
  }),
);

authRouter.post(
  "/login",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req.body);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const valid = verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !valid) {
      await recordAudit(req, {
        action: "auth.login_failed",
        metadata: { email: input.email },
      });
      throw unauthorized("Invalid email or password");
    }

    await prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarColor: user.avatarColor,
      timezone: user.timezone,
    };

    const csrfToken = await establishSession(res, user.id, req);
    await recordAudit(req, { action: "auth.login", entityType: "User", entityId: user.id });

    const payload = await loadUserPayload(user.id);
    res.json({ user: payload, csrfToken });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw unauthorized("No refresh session");

    const tokenHash = hashRefreshToken(raw);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      clearAuthCookies(res);
      throw unauthorized("Your session has expired");
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    req.user = {
      id: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      avatarColor: "#6366f1",
      timezone: "UTC",
    };

    const csrfToken = await establishSession(res, stored.user.id, req);
    const payload = await loadUserPayload(stored.user.id);
    res.json({ user: payload, csrfToken });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearAuthCookies(res);
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const csrfToken =
      (req.cookies?.[CSRF_COOKIE] as string | undefined) ?? setCsrfCookie(res);
    const payload = await loadUserPayload(req.user!.id);
    res.json({ user: payload, csrfToken });
  }),
);

authRouter.patch(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = parseBody(profileSchema, req.body);
    if (Object.keys(input).length === 0) throw badRequest("No profile changes provided");

    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarColor !== undefined ? { avatarColor: input.avatarColor } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });

    await recordAudit(req, {
      action: "auth.profile_updated",
      entityType: "User",
      entityId: req.user!.id,
    });

    const payload = await loadUserPayload(req.user!.id);
    res.json({ user: payload });
  }),
);

authRouter.post(
  "/change-password",
  authenticate,
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(passwordChangeSchema, req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw unauthorized();

    if (!verifyPassword(input.currentPassword, user.passwordHash)) {
      throw unauthorized("Current password is incorrect");
    }

    const passwordHash = hashPassword(input.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const csrfToken = await establishSession(res, user.id, req);
    await recordAudit(req, {
      action: "auth.password_changed",
      entityType: "User",
      entityId: user.id,
    });

    const payload = await loadUserPayload(user.id);
    res.json({ user: payload, csrfToken });
  }),
);

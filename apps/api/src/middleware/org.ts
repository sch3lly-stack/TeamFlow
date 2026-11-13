import type { RequestHandler } from "express";
import { prisma } from "../db";
import { can, type Capability } from "../domain/permissions";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors";

function resolveOrgId(req: Parameters<RequestHandler>[0]): string | undefined {
  const params = req.params as Record<string, string | undefined>;
  const body = req.body as Record<string, unknown> | undefined;
  const query = req.query as Record<string, unknown>;
  const candidates = [
    params.orgId,
    params.organizationId,
    typeof body?.organizationId === "string" ? body.organizationId : undefined,
    typeof query.organizationId === "string" ? query.organizationId : undefined,
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * Resolves the organization from the route and attaches the caller's
 * membership. A missing membership returns 404 so organization IDs are not
 * enumerable by outsiders.
 */
export const requireOrg: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (!req.user) throw badRequest("Authentication required");

  const organizationId = resolveOrgId(req);
  if (!organizationId) throw badRequest("Organization is required");

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: req.user.id, organizationId },
    },
  });

  if (!membership) throw notFound("Organization not found");

  req.membership = membership;
  req.organizationId = organizationId;
  next();
});

export function requireCapability(capability: Capability): RequestHandler {
  return (req, _res, next) => {
    if (!req.membership) throw badRequest("Organization context is required");
    if (!can(req.membership.role, capability)) {
      throw forbidden("Your role does not allow this action");
    }
    next();
  };
}

export function requireAnyCapability(...capabilities: Capability[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.membership) throw badRequest("Organization context is required");
    if (!capabilities.some((capability) => can(req.membership!.role, capability))) {
      throw forbidden("Your role does not allow this action");
    }
    next();
  };
}

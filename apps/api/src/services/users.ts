import { prisma } from "../db";
import { notFound } from "../lib/errors";

export async function loadUserPayload(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarColor: true,
      timezone: true,
      createdAt: true,
    },
  });
  if (!user) throw notFound("User not found");

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      organization: { select: { id: true, name: true, slug: true, logoColor: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    ...user,
    memberships: memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      title: membership.title,
      organizationId: membership.organizationId,
      organization: membership.organization,
      department: membership.department,
    })),
  };
}

export type UserPayload = Awaited<ReturnType<typeof loadUserPayload>>;

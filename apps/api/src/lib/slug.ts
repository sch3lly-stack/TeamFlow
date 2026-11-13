import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "organization";
}

type SlugClient = Pick<Prisma.TransactionClient, "organization">;

export async function generateUniqueSlug(
  client: SlugClient,
  name: string,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;
  while (await client.organization.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > 200) {
      candidate = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

export async function organizationSlugAvailable(slug: string): Promise<boolean> {
  return (await prisma.organization.findUnique({ where: { slug } })) === null;
}

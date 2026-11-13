import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://teamflow:teamflow@localhost:5432/teamflow_test?schema=public";

export default async function globalSetup() {
  const cwd = path.resolve(process.cwd());
  execSync("npx prisma migrate deploy --schema prisma/schema.prisma", {
    cwd,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });

  try {
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}

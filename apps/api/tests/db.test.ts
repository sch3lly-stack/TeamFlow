import { describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { createProject, createTask, registerOwner } from "./helpers";

describe("database constraints and cascades", () => {
  it("enforces unique organization slugs and membership rows", async () => {
    const first = await registerOwner("Constraint One");
    const second = await registerOwner("Constraint Two");

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: first.orgId },
    });

    await expect(
      prisma.organization.create({
        data: { name: "Duplicate", slug: organization.slug },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await expect(
      prisma.membership.create({
        data: { userId: first.user.id, organizationId: first.orgId, role: "DEVELOPER" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(second.orgId).not.toBe(first.orgId);
  });

  it("enforces project task numbering and cascades child records", async () => {
    const owner = await registerOwner("Cascade Org");
    const project = await createProject(owner);
    const task = await createTask(owner, project.id, { title: "Cascade root" });
    const blocker = await createTask(owner, project.id, { title: "Blocker" });

    await expect(
      prisma.task.create({
        data: {
          organizationId: owner.orgId,
          projectId: project.id,
          columnId: task.columnId,
          number: task.number,
          title: "Duplicate number",
          createdById: owner.user.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const comment = await prisma.comment.create({
      data: { taskId: task.id, authorId: owner.user.id, body: "Cascade comment" },
    });
    const assignment = await prisma.taskAssignment.create({
      data: { taskId: task.id, userId: owner.user.id },
    });
    const dependency = await prisma.taskDependency.create({
      data: { taskId: task.id, dependsOnTaskId: blocker.id },
    });

    await prisma.task.delete({ where: { id: task.id } });

    expect(await prisma.comment.count({ where: { id: comment.id } })).toBe(0);
    expect(await prisma.taskAssignment.count({ where: { id: assignment.id } })).toBe(0);
    expect(await prisma.taskDependency.count({ where: { id: dependency.id } })).toBe(0);
    expect(await prisma.task.count({ where: { id: blocker.id } })).toBe(1);
  });
});

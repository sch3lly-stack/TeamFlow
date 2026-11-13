import type { Membership, Project, ProjectMember } from "@prisma/client";
import { prisma } from "../db";
import { effectiveCapabilities, type Capability } from "../domain/permissions";
import { forbidden, notFound } from "../lib/errors";

export type ProjectContext = {
  project: Project;
  membership: Membership;
  projectMember: ProjectMember | null;
  capabilities: Set<Capability>;
};

/**
 * Loads a project together with the caller's organization membership and
 * project membership. Access is only possible through an organization
 * membership, so cross-organization project IDs resolve as 404.
 */
export async function getProjectContext(
  userId: string,
  projectId: string,
): Promise<ProjectContext> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project not found");

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: project.organizationId,
      },
    },
  });
  if (!membership) throw notFound("Project not found");

  const projectMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });

  return {
    project,
    membership,
    projectMember,
    capabilities: effectiveCapabilities(membership.role, projectMember?.role),
  };
}

export type TaskContext = ProjectContext & {
  task: { id: string; projectId: string; organizationId: string; title: string };
};

export async function getTaskContext(userId: string, taskId: string): Promise<TaskContext> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, organizationId: true, title: true },
  });
  if (!task) throw notFound("Task not found");

  const projectContext = await getProjectContext(userId, task.projectId);
  if (projectContext.project.organizationId !== task.organizationId) {
    throw notFound("Task not found");
  }

  return { ...projectContext, task };
}

export function requireProjectCapability(
  context: ProjectContext,
  capability: Capability,
): void {
  if (!context.capabilities.has(capability)) {
    throw forbidden("Your role does not allow this action on this project");
  }
}

export async function requireOrganizationMembership(
  userId: string,
  organizationId: string,
): Promise<Membership> {
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership) throw notFound("Organization not found");
  return membership;
}

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addProjectMember,
  authedDelete,
  authedPatch,
  authedPost,
  createProject,
  createTask,
  inviteMember,
  registerOwner,
} from "./helpers";

describe("role-based access control", () => {
  it("enforces read-only access at the backend", async () => {
    const owner = await registerOwner();
    const project = await createProject(owner);
    const viewer = await inviteMember(owner, "VIEWER");

    await viewer.agent.get(`/api/projects/${project.id}`).expect(200);
    await viewer.agent.get(`/api/organizations/${owner.orgId}/members`).expect(200);

    await authedPost(viewer, `/api/projects/${project.id}/tasks`, { title: "Viewer write" }).expect(403);
    await authedPatch(viewer, `/api/projects/${project.id}`, { name: "No" }).expect(403);
    await authedPost(viewer, `/api/projects/${project.id}/sprints`, {
      name: "No sprint",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86_400_000).toISOString(),
    }).expect(403);
    await authedPost(viewer, `/api/organizations/${owner.orgId}/teams`, { name: "No team" }).expect(403);
    await authedPatch(viewer, `/api/organizations/${owner.orgId}`, { name: "No" }).expect(403);
    await viewer.agent.get(`/api/organizations/${owner.orgId}/audit-logs`).expect(403);
  });

  it("separates developer permissions from project manager permissions", async () => {
    const owner = await registerOwner();
    const project = await createProject(owner);
    const developer = await inviteMember(owner, "DEVELOPER");
    await addProjectMember(owner, project.id, developer.user.id, "CONTRIBUTOR");

    const task = await createTask(developer, project.id, { title: "Developer task" });
    await authedPatch(developer, `/api/tasks/${task.id}`, { priority: "HIGH" }).expect(200);
    await authedDelete(developer, `/api/tasks/${task.id}`).expect(403);
    await authedPost(developer, `/api/projects/${project.id}/sprints`, {
      name: "Developer sprint",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }).expect(403);
    await authedPatch(developer, `/api/projects/${project.id}`, { name: "No" }).expect(403);

    // Promoting the same developer to project manager grants project capabilities.
    await addProjectMember(owner, project.id, developer.user.id, "MANAGER");
    await authedPatch(developer, `/api/projects/${project.id}`, { name: "Renamed by PM" }).expect(200);
    const sprint = await authedPost(developer, `/api/projects/${project.id}/sprints`, {
      name: `PM sprint ${randomUUID().slice(0, 5)}`,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }).expect(201);
    expect(sprint.body.sprint.status).toBe("PLANNED");
    await authedDelete(developer, `/api/tasks/${task.id}`).expect(204);
  });

  it("allows team leads to manage teams but not organization settings", async () => {
    const owner = await registerOwner();
    const lead = await inviteMember(owner, "TEAM_LEAD");
    const name = `Team ${randomUUID().slice(0, 5)}`;
    await authedPost(lead, `/api/organizations/${owner.orgId}/teams`, { name }).expect(201);
    await authedPatch(lead, `/api/organizations/${owner.orgId}`, { name: "No" }).expect(403);
    await authedPost(lead, `/api/organizations/${owner.orgId}/departments`, { name: "No dept" }).expect(403);
  });

  it("protects owner accounts and the last owner", async () => {
    const owner = await registerOwner();
    const admin = await inviteMember(owner, "ADMIN");
    const developer = await inviteMember(owner, "DEVELOPER");

    const members = await owner.agent.get(`/api/organizations/${owner.orgId}/members`).expect(200);
    const ownerMembership = members.body.members.find(
      (member: { role: string }) => member.role === "OWNER",
    );
    expect(ownerMembership).toBeTruthy();

    await authedPatch(admin, `/api/organizations/${owner.orgId}/members/${ownerMembership.id}`, {
      role: "DEVELOPER",
    }).expect(403);

    await authedPatch(owner, `/api/organizations/${owner.orgId}/members/${ownerMembership.id}`, {
      role: "DEVELOPER",
    }).expect(400);

    const developerMembership = members.body.members.find(
      (member: { user: { id: string } }) => member.user.id === developer.user.id,
    );
    await authedPatch(owner, `/api/organizations/${owner.orgId}/members/${developerMembership.id}`, {
      role: "ADMIN",
    }).expect(200);

    await authedPost(admin, `/api/organizations/${owner.orgId}/invitations`, {
      email: `owner-invite-${randomUUID()}@teamflow.test`,
      role: "OWNER",
    }).expect(400);
  });
});

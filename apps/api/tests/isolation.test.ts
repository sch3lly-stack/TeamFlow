import { describe, expect, it } from "vitest";
import {
  authedDelete,
  authedPatch,
  authedPost,
  createProject,
  createTask,
  registerOwner,
} from "./helpers";

describe("organization isolation", () => {
  it("never exposes another tenant's project, task, dashboard or invite", async () => {
    const alpha = await registerOwner("Alpha");
    const beta = await registerOwner("Beta");
    const alphaProject = await createProject(alpha, { name: "Alpha Secret" });
    const betaProject = await createProject(beta, { name: "Beta Secret" });
    const betaTask = await createTask(beta, betaProject.id, { title: "Beta confidential task" });

    await alpha.agent.get(`/api/projects/${betaProject.id}`).expect(404);
    await alpha.agent.get(`/api/projects/${betaProject.id}/tasks`).expect(404);
    await alpha.agent.get(`/api/organizations/${beta.orgId}/dashboard`).expect(404);
    await alpha.agent.get(`/api/organizations/${beta.orgId}/analytics`).expect(404);
    await alpha.agent.get(`/api/organizations/${beta.orgId}/workload`).expect(404);
    await alpha.agent.get(`/api/organizations/${beta.orgId}/members`).expect(404);
    await alpha.agent.get(`/api/tasks/${betaTask.id}`).expect(404);
    await authedPatch(alpha, `/api/tasks/${betaTask.id}`, { title: "Hijacked" }).expect(404);
    await authedPatch(alpha, `/api/projects/${betaProject.id}`, { name: "Hijacked" }).expect(404);
    await authedDelete(alpha, `/api/projects/${betaProject.id}`).expect(404);

    await authedPatch(alpha, `/api/organizations/${beta.orgId}`, { name: "Hijacked" }).expect(404);
    await authedPost(alpha, `/api/projects/${betaProject.id}/tasks`, { title: "Nope" }).expect(404);
    await authedPost(alpha, `/api/organizations/${alpha.orgId}/projects`, {
      name: "Cross org owner",
      key: "CROSS",
      ownerId: beta.user.id,
    }).expect(400);
  });

  it("does not leak search, notifications or workload across organizations", async () => {
    const alpha = await registerOwner("Search Alpha");
    const beta = await registerOwner("Search Beta");
    await createProject(alpha);
    const betaProject = await createProject(beta);
    const secretTitle = "Zebra confidential roadmap 9f7a";
    await createTask(beta, betaProject.id, {
      title: secretTitle,
      assigneeIds: [beta.user.id],
    });

    const search = await alpha.agent
      .get(`/api/organizations/${alpha.orgId}/search?q=zebra`)
      .expect(200);
    expect(search.body.tasks).toHaveLength(0);
    expect(search.body.projects).toHaveLength(0);

    const notifications = await alpha.agent.get("/api/notifications").expect(200);
    expect(
      notifications.body.notifications.some(
        (notification: { organizationId: string }) => notification.organizationId === beta.orgId,
      ),
    ).toBe(false);

    const workload = await alpha.agent
      .get(`/api/organizations/${alpha.orgId}/workload`)
      .expect(200);
    expect(workload.body.members.every((member: { userId: string }) => member.userId !== beta.user.id)).toBe(
      true,
    );

    const alphaProject = await createProject(alpha);
    await authedPost(alpha, `/api/projects/${alphaProject.id}/tasks`, {
      title: "Cross tenant assignment",
      assigneeIds: [beta.user.id],
    }).expect(400);

    await authedPost(alpha, `/api/projects/${alphaProject.id}/members`, {
      userId: beta.user.id,
      role: "VIEWER",
    }).expect(400);
  });

  it("returns 404 for another tenant's task dependencies and comments", async () => {
    const alpha = await registerOwner("Dep Alpha");
    const beta = await registerOwner("Dep Beta");
    const alphaProject = await createProject(alpha);
    const betaProject = await createProject(beta);
    const alphaTask = await createTask(alpha, alphaProject.id);
    const betaTask = await createTask(beta, betaProject.id);

    await alpha.agent.get(`/api/tasks/${betaTask.id}/comments`).expect(404);
    await authedPost(alpha, `/api/tasks/${betaTask.id}/comments`, { body: "intrusion" }).expect(404);
    await authedPost(alpha, `/api/tasks/${alphaTask.id}/dependencies`, {
      dependsOnTaskId: betaTask.id,
    }).expect(400);
  });
});

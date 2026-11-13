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

describe("task workflow", () => {
  it("creates, moves, completes, comments and reports on tasks", async () => {
    const owner = await registerOwner();
    const developer = await inviteMember(owner, "DEVELOPER");
    const project = await createProject(owner);
    await addProjectMember(owner, project.id, developer.user.id, "CONTRIBUTOR");

    const columns = project.columns;
    const backlog = columns.find((column) => column.name === "Backlog")!;
    const todo = columns.find((column) => column.name === "To Do")!;
    const done = columns.find((column) => column.isDone)!;

    const first = await createTask(owner, project.id, {
      title: "Isolation regression test",
      description: "Prove tenant-scoped queries",
      priority: "HIGH",
      columnId: backlog.id,
      assigneeIds: [developer.user.id],
      estimateHours: 5,
      storyPoints: 3,
    });
    expect(first.number).toBe(1);
    expect(first.assignments).toHaveLength(1);
    expect(first.column.name).toBe("Backlog");

    const second = await createTask(owner, project.id, { title: "Second task" });
    expect(second.number).toBe(2);

    const list = await owner.agent.get(`/api/projects/${project.id}/tasks`).expect(200);
    expect(list.body.tasks).toHaveLength(2);

    const moved = await authedPatch(owner, `/api/tasks/${first.id}/move`, {
      columnId: todo.id,
    }).expect(200);
    expect(moved.body.task.column.name).toBe("To Do");
    expect(moved.body.task.completedAt).toBeNull();

    const completed = await authedPatch(owner, `/api/tasks/${first.id}/move`, {
      columnId: done.id,
    }).expect(200);
    expect(completed.body.task.completedAt).toBeTruthy();

    const reopened = await authedPatch(owner, `/api/tasks/${first.id}/move`, {
      columnId: todo.id,
    }).expect(200);
    expect(reopened.body.task.completedAt).toBeNull();

    const comment = await authedPost(developer, `/api/tasks/${first.id}/comments`, {
      body: "Ready for review after the tenant fix.",
    }).expect(201);
    expect(comment.body.comment.author.id).toBe(developer.user.id);

    const comments = await owner.agent.get(`/api/tasks/${first.id}/comments`).expect(200);
    expect(comments.body.comments).toHaveLength(1);

    await authedDelete(developer, `/api/tasks/${first.id}/comments/${comment.body.comment.id}`).expect(204);

    const notifications = await developer.agent.get("/api/notifications").expect(200);
    expect(
      notifications.body.notifications.some(
        (notification: { entityId: string }) => notification.entityId === first.id,
      ),
    ).toBe(true);

    const detail = await owner.agent.get(`/api/tasks/${first.id}`).expect(200);
    expect(detail.body.task.activities.length).toBeGreaterThan(0);
    expect(detail.body.task.activities.some((activity: { action: string }) => activity.action === "task.moved")).toBe(true);

    const report = await owner.agent.get(`/api/projects/${project.id}/report?format=csv`).expect(200);
    expect(report.headers["content-type"]).toContain("text/csv");
    expect(report.text).toContain(`${project.key}-1`);
    expect(report.text).toContain("Isolation regression test");

    const search = await owner.agent
      .get(`/api/organizations/${owner.orgId}/search?q=isolation`)
      .expect(200);
    expect(search.body.tasks).toHaveLength(1);

    await authedDelete(owner, `/api/tasks/${second.id}`).expect(204);
    await owner.agent.get(`/api/tasks/${second.id}`).expect(404);
  });

  it("prevents circular task dependencies", async () => {
    const owner = await registerOwner();
    const project = await createProject(owner);
    const taskA = await createTask(owner, project.id, { title: "Task A" });
    const taskB = await createTask(owner, project.id, { title: "Task B" });

    await authedPost(owner, `/api/tasks/${taskA.id}/dependencies`, {
      dependsOnTaskId: taskB.id,
    }).expect(201);

    const cycle = await authedPost(owner, `/api/tasks/${taskB.id}/dependencies`, {
      dependsOnTaskId: taskA.id,
    }).expect(409);
    expect(cycle.body.error.code).toBe("CONFLICT");

    const detail = await owner.agent.get(`/api/tasks/${taskA.id}`).expect(200);
    expect(detail.body.task.dependencies).toHaveLength(1);
  });

  it("runs the sprint lifecycle and preserves incomplete work in reports", async () => {
    const owner = await registerOwner();
    const project = await createProject(owner);
    const taskA = await createTask(owner, project.id, { title: "Sprint task A", storyPoints: 3 });
    const taskB = await createTask(owner, project.id, { title: "Sprint task B", storyPoints: 2 });

    const start = new Date(Date.now() - 86_400_000).toISOString();
    const end = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const sprint = await authedPost(owner, `/api/projects/${project.id}/sprints`, {
      name: "Integration Sprint",
      goal: "Verify sprint reporting",
      startDate: start,
      endDate: end,
    }).expect(201);
    const sprintId = sprint.body.sprint.id;

    await authedPost(owner, `/api/sprints/${sprintId}/tasks`, {
      taskIds: [taskA.id, taskB.id],
    }).expect(200);

    await authedPost(owner, `/api/sprints/${sprintId}/start`).expect(200);

    const second = await authedPost(owner, `/api/projects/${project.id}/sprints`, {
      name: "Overlapping Sprint",
      startDate: start,
      endDate: end,
    }).expect(201);
    const conflict = await authedPost(owner, `/api/sprints/${second.body.sprint.id}/start`).expect(409);
    expect(conflict.body.error.message).toContain("Finish");

    const report = await owner.agent.get(`/api/sprints/${sprintId}/report`).expect(200);
    expect(report.body.summary.totalTasks).toBe(2);
    expect(report.body.summary.incompleteTasks).toBe(2);
    expect(report.body.burndown.length).toBeGreaterThan(0);

    await authedPost(owner, `/api/sprints/${sprintId}/complete`).expect(200);

    await authedPost(owner, `/api/sprints/${sprintId}/tasks`, {
      taskIds: [taskA.id],
    }).expect(400);

    const carry = await authedPost(owner, `/api/sprints/${sprintId}/carry-over`, {
      targetSprintId: null,
    }).expect(200);
    expect(carry.body.moved).toBe(2);
  });

  it("handles milestones and project archive", async () => {
    const owner = await registerOwner();
    const project = await createProject(owner);

    const milestone = await authedPost(owner, `/api/projects/${project.id}/milestones`, {
      name: "Public beta",
      description: "Design partner release",
      dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      status: "PENDING",
    }).expect(201);

    const completed = await authedPatch(
      owner,
      `/api/projects/${project.id}/milestones/${milestone.body.milestone.id}`,
      { status: "COMPLETED" },
    ).expect(200);
    expect(completed.body.milestone.completedAt).toBeTruthy();

    await authedDelete(owner, `/api/projects/${project.id}`).expect(204);
    await owner.agent.get(`/api/projects/${project.id}`).expect(200);
    const projects = await owner.agent.get(`/api/organizations/${owner.orgId}/projects`).expect(200);
    expect(projects.body.projects.some((candidate: { id: string }) => candidate.id === project.id)).toBe(false);
  });
});

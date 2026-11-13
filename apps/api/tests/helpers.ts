import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { hashPassword } from "../src/lib/password";

export const PASSWORD = "Password123!";

type Agent = ReturnType<typeof request.agent>;

export type Client = {
  agent: Agent;
  csrf: string;
  user: { id: string; email: string; name: string };
  orgId: string;
  email: string;
};

function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID()}@teamflow.test`;
}

export async function registerOwner(organizationName = "Test Organization"): Promise<Client> {
  const agent = request.agent(app);
  const email = uniqueEmail("owner");
  const response = await agent
    .post("/api/auth/register")
    .send({
      name: "Test Owner",
      email,
      password: PASSWORD,
      organizationName: `${organizationName} ${randomUUID().slice(0, 6)}`,
    })
    .expect(201);

  return {
    agent,
    csrf: response.body.csrfToken,
    user: response.body.user,
    orgId: response.body.user.memberships[0].organizationId,
    email,
  };
}

export async function login(email: string, password = PASSWORD): Promise<Client> {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return {
    agent,
    csrf: response.body.csrfToken,
    user: response.body.user,
    orgId: response.body.user.memberships[0]?.organizationId,
    email,
  };
}

export async function inviteMember(
  owner: Client,
  role:
    | "ADMIN"
    | "PROJECT_MANAGER"
    | "TEAM_LEAD"
    | "DEVELOPER"
    | "VIEWER" = "DEVELOPER",
): Promise<Client> {
  const email = uniqueEmail("member");
  const invitation = await owner.agent
    .post(`/api/organizations/${owner.orgId}/invitations`)
    .set("X-CSRF-Token", owner.csrf)
    .send({ email, role })
    .expect(201);

  const agent = request.agent(app);
  const registration = await agent
    .post("/api/auth/register")
    .send({ name: `Member ${role}`, email, password: PASSWORD })
    .expect(201);

  const accept = await agent
    .post(`/api/invitations/${invitation.body.invitation.token}/accept`)
    .set("X-CSRF-Token", registration.body.csrfToken)
    .expect(200);

  return {
    agent,
    csrf: registration.body.csrfToken,
    user: registration.body.user,
    orgId: owner.orgId,
    email,
  };
}

export function authedPost(client: Client, path: string, body?: unknown) {
  const request = client.agent.post(path).set("X-CSRF-Token", client.csrf);
  return body === undefined ? request : request.send(body as object);
}

export function authedPatch(client: Client, path: string, body?: unknown) {
  const request = client.agent.patch(path).set("X-CSRF-Token", client.csrf);
  return body === undefined ? request : request.send(body as object);
}

export function authedDelete(client: Client, path: string) {
  return client.agent.delete(path).set("X-CSRF-Token", client.csrf);
}

export async function createProject(
  client: Client,
  overrides: Record<string, unknown> = {},
) {
  const key = `T${randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
  const response = await authedPost(client, `/api/organizations/${client.orgId}/projects`)
    .send({
      name: `Test Project ${key}`,
      key,
      description: "Integration test project",
      ...overrides,
    })
    .expect(201);
  return response.body.project as {
    id: string;
    key: string;
    columns: { id: string; name: string; isDone: boolean }[];
  };
}

export async function createTask(
  client: Client,
  projectId: string,
  body: Record<string, unknown> = {},
) {
  const response = await authedPost(client, `/api/projects/${projectId}/tasks`)
    .send({ title: "Test task", ...body })
    .expect(201);
  return response.body.task;
}

export async function addProjectMember(
  owner: Client,
  projectId: string,
  userId: string,
  role: "MANAGER" | "CONTRIBUTOR" | "VIEWER" = "CONTRIBUTOR",
) {
  const response = await authedPost(owner, `/api/projects/${projectId}/members`)
    .send({ userId, role })
    .expect(201);
  return response.body.member;
}

export async function createDirectUser(
  organizationId?: string,
  role: "OWNER" | "DEVELOPER" | "VIEWER" = "DEVELOPER",
) {
  const email = uniqueEmail("direct");
  const user = await prisma.user.create({
    data: {
      email,
      name: "Direct User",
      passwordHash: hashPassword(PASSWORD),
    },
  });
  if (organizationId) {
    await prisma.membership.create({
      data: { userId: user.id, organizationId, role },
    });
  }
  return { user, email };
}

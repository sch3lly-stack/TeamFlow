import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { io as createSocket, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { closeRealtime, initRealtime } from "../src/realtime";
import {
  authedPost,
  createProject,
  inviteMember,
  PASSWORD,
  registerOwner,
} from "./helpers";

let server: Server;
let baseUrl: string;

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 6000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connectWithCookies(cookieHeader: string): Socket {
  return createSocket(baseUrl, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { Cookie: cookieHeader },
  });
}

async function cookieHeaderFor(email: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: PASSWORD })
    .expect(200);
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

beforeAll(async () => {
  server = createServer(app);
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await closeRealtime();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("realtime", () => {
  it("rejects unauthenticated socket connections", async () => {
    const socket = createSocket(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
    });
    const error = await new Promise<Error>((resolve) => {
      socket.on("connect_error", (caught) => resolve(caught as Error));
      setTimeout(() => resolve(new Error("timeout")), 5000);
    });
    expect(error.message).toMatch(/unauthorized/);
    socket.close();
  });

  it("broadcasts task changes and notifies assignees", async () => {
    const owner = await registerOwner("Realtime Org");
    const project = await createProject(owner);
    const cookie = await cookieHeaderFor(owner.email);
    const socket = connectWithCookies(cookie);

    await waitFor<{ userId: string }>(socket, "connected");

    const taskCreated = waitFor<{ title: string; projectId: string }>(socket, "task:created");
    await authedPost(owner, `/api/projects/${project.id}/tasks`, {
      title: "Realtime task",
      priority: "HIGH",
    }).expect(201);
    const created = await taskCreated;
    expect(created.title).toBe("Realtime task");
    expect(created.projectId).toBe(project.id);

    const member = await inviteMember(owner, "DEVELOPER");
    const notificationPromise = waitFor<{ title: string; userId: string }>(socket, "notification");
    await authedPost(member, `/api/projects/${project.id}/tasks`, {
      title: "Assigned to owner",
      assigneeIds: [owner.user.id],
    }).expect(201);

    const notification = await notificationPromise;
    expect(notification.userId).toBe(owner.user.id);
    expect(notification.title).toContain("assigned to you");

    socket.close();
  });
});

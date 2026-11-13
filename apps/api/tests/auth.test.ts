import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { authedPost, PASSWORD, registerOwner } from "./helpers";

function cookies(response: request.Response): string[] {
  return (response.headers["set-cookie"] ?? []) as unknown as string[];
}

describe("authentication", () => {
  it("registers an owner, returns the membership and sets hardened cookies", async () => {
    const agent = request.agent(app);
    const email = `auth-${Date.now()}@teamflow.test`;
    const response = await agent
      .post("/api/auth/register")
      .send({ name: "Auth Owner", email, password: PASSWORD, organizationName: "Auth Org" })
      .expect(201);

    expect(response.body.user.email).toBe(email);
    expect(response.body.user.memberships).toHaveLength(1);
    expect(response.body.user.memberships[0].role).toBe("OWNER");
    expect(response.body.csrfToken).toBeTruthy();
    expect(response.body.user.passwordHash).toBeUndefined();

    const setCookies = cookies(response);
    const access = setCookies.find((cookie) => cookie.startsWith("tf_access="));
    const refresh = setCookies.find((cookie) => cookie.startsWith("tf_refresh="));
    const csrf = setCookies.find((cookie) => cookie.startsWith("tf_csrf="));
    expect(access).toContain("HttpOnly");
    expect(access).toContain("SameSite=Lax");
    expect(refresh).toContain("HttpOnly");
    expect(refresh).toContain("Path=/api/auth");
    expect(csrf).not.toContain("HttpOnly");

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user.email).toBe(email);
  });

  it("rejects duplicate registrations", async () => {
    const email = `dupe-${Date.now()}@teamflow.test`;
    await request(app)
      .post("/api/auth/register")
      .send({ name: "First", email, password: PASSWORD })
      .expect(201);
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Second", email, password: PASSWORD })
      .expect(409);
  });

  it("rejects invalid credentials without revealing which field was wrong", async () => {
    const owner = await registerOwner();
    const badPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: owner.email, password: "wrong-password" })
      .expect(401);
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@teamflow.test", password: PASSWORD })
      .expect(401);
    expect(badPassword.body.error.message).toBe(unknown.body.error.message);
  });

  it("requires CSRF for cookie-authenticated mutations", async () => {
    const owner = await registerOwner();
    const response = await owner.agent
      .post(`/api/organizations/${owner.orgId}/projects`)
      .send({ name: "No CSRF", key: "NOCSRF" })
      .expect(403);
    expect(response.body.error.code).toBe("CSRF_MISSING");
  });

  it("rotates refresh tokens and invalidates the session on logout", async () => {
    const agent = request.agent(app);
    const email = `rotate-${Date.now()}@teamflow.test`;
    const registration = await agent
      .post("/api/auth/register")
      .send({ name: "Rotate", email, password: PASSWORD })
      .expect(201);

    const firstRefresh = cookies(registration)
      .find((cookie) => cookie.startsWith("tf_refresh="))
      ?.split(";")[0];
    const refreshed = await agent.post("/api/auth/refresh").expect(200);
    const secondRefresh = cookies(refreshed)
      .find((cookie) => cookie.startsWith("tf_refresh="))
      ?.split(";")[0];
    expect(secondRefresh).toBeTruthy();
    expect(secondRefresh).not.toBe(firstRefresh);

    await agent
      .post("/api/auth/logout")
      .set("X-CSRF-Token", refreshed.body.csrfToken)
      .expect(204);
    await agent.get("/api/auth/me").expect(401);
    await agent.post("/api/auth/refresh").expect(401);
  });

  it("changes the password and revokes existing refresh tokens", async () => {
    const owner = await registerOwner();
    await authedPost(owner, "/api/auth/change-password", {
      currentPassword: PASSWORD,
      newPassword: "NewPassword456!",
    }).expect(200);

    await request(app)
      .post("/api/auth/login")
      .send({ email: owner.email, password: PASSWORD })
      .expect(401);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: owner.email, password: "NewPassword456!" })
      .expect(200);
    expect(login.body.user.email).toBe(owner.email);
  });

  it("rejects unauthenticated organization access", async () => {
    await request(app).get("/api/organizations").expect(401);
  });
});

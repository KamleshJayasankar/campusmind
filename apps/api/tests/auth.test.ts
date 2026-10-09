import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { createDepartment, ensureTimeLeftInMinute, resetState } from "./helpers";

const newUser = {
  name: "Asha Kumar",
  email: "asha@example.com",
  password: "password123",
  departmentSlug: "csbs",
};

describe("auth", () => {
  beforeEach(async () => {
    await resetState();
    await createDepartment("csbs", "CSBS");
  });

  it("registers a student and returns a token", async () => {
    const res = await request(app).post("/auth/register").send(newUser);
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: "asha@example.com", role: "student" });
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("ignores a role sent by the client", async () => {
    const res = await request(app).post("/auth/register").send({ ...newUser, role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("student");
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/auth/register").send(newUser);
    const res = await request(app).post("/auth/register").send({ ...newUser, email: "ASHA@example.com" });
    expect(res.status).toBe(409);
  });

  it("rejects short passwords and unknown departments", async () => {
    const short = await request(app).post("/auth/register").send({ ...newUser, password: "short" });
    expect(short.status).toBe(400);
    const unknown = await request(app).post("/auth/register").send({ ...newUser, departmentSlug: "nope" });
    expect(unknown.status).toBe(400);
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    await request(app).post("/auth/register").send(newUser);
    const ok = await request(app).post("/auth/login").send({ email: newUser.email, password: newUser.password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));
    const bad = await request(app).post("/auth/login").send({ email: newUser.email, password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("returns the current user on /auth/me and rejects bad tokens", async () => {
    const registered = await request(app).post("/auth/register").send(newUser);
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${registered.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("asha@example.com");

    expect((await request(app).get("/auth/me")).status).toBe(401);
    expect((await request(app).get("/auth/me").set("Authorization", "Bearer not-a-token")).status).toBe(401);
  });

  it("rate limits repeated login attempts", async () => {
    await ensureTimeLeftInMinute();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(app).post("/auth/login").send({ email: newUser.email, password: "guess" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  }, 20000);
});

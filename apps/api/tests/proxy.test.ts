import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { createDepartment, ensureTimeLeftInMinute, resetState } from "./helpers";

describe("behind a proxy", () => {
  beforeEach(async () => {
    await resetState();
    await createDepartment("csbs", "CSBS");
  });

  it("rate limits each client IP separately using X-Forwarded-For", async () => {
    await ensureTimeLeftInMinute();
    const attempt = (ip: string) =>
      request(app).post("/auth/login").set("X-Forwarded-For", ip).send({ email: "a@example.com", password: "guess" });

    for (let i = 0; i < 10; i++) expect((await attempt("203.0.113.7")).status).toBe(401);
    expect((await attempt("203.0.113.7")).status).toBe(429);
    // A different visitor behind the same proxy is not affected.
    expect((await attempt("198.51.100.9")).status).toBe(401);
  }, 20000);

  it("allows any origin when CORS_ORIGIN is not set (local development)", async () => {
    const res = await request(app).get("/health").set("Origin", "https://example.com");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://example.com");
  });
});

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { redis } from "../src/cache";
import { generateAnswer } from "../src/ai/generation";
import { addDocument, createDepartment, createUser, ensureTimeLeftInMinute, resetState } from "./helpers";

const ask = (token: string, question: string, chatId?: string) =>
  request(app).post("/chat").set("Authorization", `Bearer ${token}`).send({ question, chatId });

describe("chat", () => {
  let token: string;

  beforeEach(async () => {
    await resetState();
    vi.mocked(generateAnswer).mockClear();

    const csbsId = await createDepartment("csbs", "CSBS");
    const mechId = await createDepartment("mech", "Mechanical");
    await addDocument({ departmentId: csbsId, title: "CSBS Rules" });
    await addDocument({ departmentId: csbsId, title: "CSBS Draft", status: "processing" });
    await addDocument({ departmentId: mechId, title: "Mech Secrets" });
    await addDocument({ departmentId: mechId, title: "College Notice", visibility: "college" });

    token = (await createUser({ email: "s@example.com", departmentSlug: "csbs" })).token;
  });

  it("answers from accessible documents and returns the cited source", async () => {
    const res = await ask(token, "How much attendance do I need?");
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("75 percent");
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0]).toMatchObject({ index: 1, page: 1 });
  });

  it("only gives the model documents the user may see", async () => {
    await ask(token, "How much attendance do I need?");
    const context = vi.mocked(generateAnswer).mock.calls[0]![1];
    const titles = context.map((c) => c.title).sort();
    // Not "Mech Secrets" (other department) and not "CSBS Draft" (still processing).
    expect(titles).toEqual(["CSBS Rules", "College Notice"]);
  });

  it("says it could not find an answer when nothing is relevant", async () => {
    const res = await ask(token, "Something unrelated to the documents");
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain("couldn't find");
    expect(res.body.sources).toEqual([]);
    expect(generateAnswer).not.toHaveBeenCalled();
  });

  it("caches repeated questions, ignoring case and spacing", async () => {
    await ask(token, "How much attendance do I need?");
    const second = await ask(token, "how much   ATTENDANCE do I need?");
    expect(second.status).toBe(200);
    expect(generateAnswer).toHaveBeenCalledTimes(1);
  });

  it("drops cached answers when documents change", async () => {
    await ask(token, "How much attendance do I need?");
    await redis.incr("docs:version");
    await ask(token, "How much attendance do I need?");
    expect(generateAnswer).toHaveBeenCalledTimes(2);
  });

  it("saves the conversation in order", async () => {
    const first = await ask(token, "How much attendance do I need?");
    const history = await request(app)
      .get(`/chat/${first.body.chatId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);

    await ask(token, "What about medical cases?", first.body.chatId);
    const again = await request(app).get(`/chat/${first.body.chatId}`).set("Authorization", `Bearer ${token}`);
    expect(again.body.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("keeps chats private to their owner", async () => {
    const mine = await ask(token, "How much attendance do I need?");
    const other = await createUser({ email: "other@example.com", departmentSlug: "csbs" });

    const read = await request(app).get(`/chat/${mine.body.chatId}`).set("Authorization", `Bearer ${other.token}`);
    expect(read.status).toBe(404);
    const write = await ask(other.token, "Sneaky follow-up question", mine.body.chatId);
    expect(write.status).toBe(404);
  });

  it("validates the question", async () => {
    const res = await ask(token, "a");
    expect(res.status).toBe(400);
  });

  it("requires login", async () => {
    const res = await request(app).post("/chat").send({ question: "How much attendance?" });
    expect(res.status).toBe(401);
  });

  it("limits each user to 10 questions per minute", async () => {
    await ensureTimeLeftInMinute();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await ask(token, "How much attendance do I need?")).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  }, 20000);
});

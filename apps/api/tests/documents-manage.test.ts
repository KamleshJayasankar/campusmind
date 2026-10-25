import fs from "fs";
import path from "path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { pool } from "../src/db";
import { redis } from "../src/cache";
import { addDocument, createDepartment, createUser, resetState } from "./helpers";

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const missingId = "00000000-0000-0000-0000-000000000000";

describe("managing documents", () => {
  let csbsId: string;
  let owner: { id: string; token: string };
  let otherFaculty: { id: string; token: string };
  let admin: { id: string; token: string };
  let student: { id: string; token: string };
  let docId: string;

  beforeEach(async () => {
    await resetState();
    csbsId = await createDepartment("csbs", "CSBS");
    owner = await createUser({ email: "owner@example.com", departmentSlug: "csbs", role: "faculty" });
    otherFaculty = await createUser({ email: "other@example.com", departmentSlug: "csbs", role: "faculty" });
    admin = await createUser({ email: "admin@example.com", departmentSlug: "csbs", role: "admin" });
    student = await createUser({ email: "student@example.com", departmentSlug: "csbs" });
    docId = await addDocument({ departmentId: csbsId, title: "Old title", uploadedBy: owner.id });
  });

  it("marks which documents each person may manage", async () => {
    const list = async (token: string) =>
      (await request(app).get("/documents").set(as(token))).body.documents[0].can_manage;
    expect(await list(owner.token)).toBe(true);
    expect(await list(admin.token)).toBe(true);
    expect(await list(otherFaculty.token)).toBe(false);
    expect(await list(student.token)).toBe(false);
  });

  it("lets the uploader rename a document", async () => {
    const res = await request(app).patch(`/documents/${docId}`).set(as(owner.token)).send({ title: "  New title  " });
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ title: "New title", can_manage: true });
    const stored = await pool.query("SELECT title FROM documents WHERE id = $1", [docId]);
    expect(stored.rows[0].title).toBe("New title");
  });

  it("lets an admin rename any document", async () => {
    const res = await request(app).patch(`/documents/${docId}`).set(as(admin.token)).send({ title: "Admin title" });
    expect(res.status).toBe(200);
  });

  it("rejects empty or oversized titles", async () => {
    const empty = await request(app).patch(`/documents/${docId}`).set(as(owner.token)).send({ title: "   " });
    expect(empty.status).toBe(400);
    const long = await request(app).patch(`/documents/${docId}`).set(as(owner.token)).send({ title: "x".repeat(201) });
    expect(long.status).toBe(400);
  });

  it("hides documents from faculty who did not upload them", async () => {
    const rename = await request(app).patch(`/documents/${docId}`).set(as(otherFaculty.token)).send({ title: "Hacked" });
    expect(rename.status).toBe(404);
    const remove = await request(app).delete(`/documents/${docId}`).set(as(otherFaculty.token));
    expect(remove.status).toBe(404);
    const stored = await pool.query("SELECT title FROM documents WHERE id = $1", [docId]);
    expect(stored.rows[0].title).toBe("Old title");
  });

  it("forbids students and anonymous users", async () => {
    expect((await request(app).patch(`/documents/${docId}`).set(as(student.token)).send({ title: "x" })).status).toBe(403);
    expect((await request(app).delete(`/documents/${docId}`).set(as(student.token))).status).toBe(403);
    expect((await request(app).delete(`/documents/${docId}`)).status).toBe(401);
  });

  it("validates the document id", async () => {
    expect((await request(app).delete("/documents/not-a-uuid").set(as(owner.token))).status).toBe(400);
    expect((await request(app).delete(`/documents/${missingId}`).set(as(owner.token))).status).toBe(404);
  });

  it("deletes a document with its chunks and its file", async () => {
    const stored = path.join(process.cwd(), "uploads", "delete-me.pdf");
    fs.mkdirSync(path.dirname(stored), { recursive: true });
    fs.writeFileSync(stored, "%PDF-1.4");
    const withFile = await addDocument({
      departmentId: csbsId,
      title: "With a file",
      uploadedBy: owner.id,
      storagePath: "uploads/delete-me.pdf",
    });

    const res = await request(app).delete(`/documents/${withFile}`).set(as(owner.token));
    expect(res.status).toBe(204);

    const docs = await pool.query("SELECT 1 FROM documents WHERE id = $1", [withFile]);
    const chunks = await pool.query("SELECT 1 FROM chunks WHERE document_id = $1", [withFile]);
    expect(docs.rowCount).toBe(0);
    expect(chunks.rowCount).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fs.existsSync(stored)).toBe(false);
  });

  it("will not delete a document that is still being processed", async () => {
    const busy = await addDocument({ departmentId: csbsId, title: "Busy", uploadedBy: owner.id, status: "processing" });
    const res = await request(app).delete(`/documents/${busy}`).set(as(owner.token));
    expect(res.status).toBe(409);
    expect((await pool.query("SELECT 1 FROM documents WHERE id = $1", [busy])).rowCount).toBe(1);
  });

  it("retires cached answers when a document is renamed or deleted", async () => {
    const before = Number((await redis.get("docs:version")) ?? 0);
    await request(app).patch(`/documents/${docId}`).set(as(owner.token)).send({ title: "Renamed" });
    const afterRename = Number(await redis.get("docs:version"));
    await request(app).delete(`/documents/${docId}`).set(as(owner.token));
    const afterDelete = Number(await redis.get("docs:version"));
    expect(afterRename).toBeGreaterThan(before);
    expect(afterDelete).toBeGreaterThan(afterRename);
  });
});

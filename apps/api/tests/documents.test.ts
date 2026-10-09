import fs from "fs";
import path from "path";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { pool } from "../src/db";
import { enqueueIngestion } from "../src/queue/ingestion.queue";
import { addDocument, createDepartment, createUser, resetState } from "./helpers";

const fakePdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

describe("documents", () => {
  let csbsId: string;
  let mechId: string;

  beforeEach(async () => {
    await resetState();
    vi.mocked(enqueueIngestion).mockClear();
    csbsId = await createDepartment("csbs", "CSBS");
    mechId = await createDepartment("mech", "Mechanical");
  });

  it("rejects unauthenticated uploads", async () => {
    const res = await request(app).post("/documents").attach("file", fakePdf, "a.pdf");
    expect(res.status).toBe(401);
  });

  it("forbids students from uploading", async () => {
    const student = await createUser({ email: "s@example.com", departmentSlug: "csbs" });
    const res = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${student.token}`)
      .attach("file", fakePdf, { filename: "a.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(403);
    expect(enqueueIngestion).not.toHaveBeenCalled();
  });

  it("lets faculty upload a PDF and queues it for processing", async () => {
    const faculty = await createUser({ email: "f@example.com", departmentSlug: "csbs", role: "faculty" });
    const res = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${faculty.token}`)
      .field("title", "Exam Regulations")
      .attach("file", fakePdf, { filename: "regs.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ title: "Exam Regulations", status: "uploaded" });
    expect(enqueueIngestion).toHaveBeenCalledWith(res.body.document.id);

    const stored = await pool.query("SELECT storage_path, department_id FROM documents WHERE id = $1", [
      res.body.document.id,
    ]);
    expect(stored.rows[0].department_id).toBe(csbsId);
    fs.rmSync(path.join(process.cwd(), stored.rows[0].storage_path), { force: true });
  });

  it("rejects files that are not PDFs", async () => {
    const faculty = await createUser({ email: "f@example.com", departmentSlug: "csbs", role: "faculty" });
    const res = await request(app)
      .post("/documents")
      .set("Authorization", `Bearer ${faculty.token}`)
      .attach("file", Buffer.from("hello"), { filename: "notes.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(enqueueIngestion).not.toHaveBeenCalled();
  });

  it("lists own-department and college-wide documents, but not other departments' private ones", async () => {
    await addDocument({ departmentId: csbsId, title: "CSBS private" });
    await addDocument({ departmentId: mechId, title: "Mech private" });
    await addDocument({ departmentId: mechId, title: "Mech college-wide", visibility: "college" });
    const student = await createUser({ email: "s@example.com", departmentSlug: "csbs" });

    const res = await request(app).get("/documents").set("Authorization", `Bearer ${student.token}`);
    expect(res.status).toBe(200);
    const titles = res.body.documents.map((d: { title: string }) => d.title).sort();
    expect(titles).toEqual(["CSBS private", "Mech college-wide"]);
  });
});

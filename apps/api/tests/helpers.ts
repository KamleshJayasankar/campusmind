import request from "supertest";
import { expect } from "vitest";
import { app } from "../src/app";
import { pool } from "../src/db";
import { redis } from "../src/cache";

export const unitVector = (i: number) =>
  `[${Array.from({ length: 768 }, (_, k) => (k === i ? 1 : 0)).join(",")}]`;

export async function resetState() {
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("Refusing to reset a database that is not a test database");
  }
  if (redis.options.db === 0) {
    throw new Error("Refusing to flush Redis DB 0 (use a test Redis DB such as /1)");
  }
  await pool.query(
    "TRUNCATE chunks, messages, chats, documents, users, departments RESTART IDENTITY CASCADE"
  );
  await redis.flushdb();
}

export async function createDepartment(slug: string, name = slug) {
  const result = await pool.query("INSERT INTO departments (name, slug) VALUES ($1, $2) RETURNING id", [
    name,
    slug,
  ]);
  return result.rows[0].id as string;
}

export async function createUser(options: {
  email: string;
  departmentSlug: string;
  role?: "student" | "faculty" | "admin";
}) {
  const registered = await request(app).post("/auth/register").send({
    name: "Test User",
    email: options.email,
    password: "password123",
    departmentSlug: options.departmentSlug,
  });
  expect(registered.status).toBe(201);
  if (options.role && options.role !== "student") {
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", [options.role, registered.body.user.id]);
  }
  // Log in again so the token carries the final role.
  const login = await request(app)
    .post("/auth/login")
    .send({ email: options.email, password: "password123" });
  expect(login.status).toBe(200);
  return { id: registered.body.user.id as string, token: login.body.token as string };
}

export async function addDocument(options: {
  departmentId: string;
  title: string;
  visibility?: "department" | "college";
  status?: "uploaded" | "processing" | "ready" | "failed";
  text?: string;
}) {
  const doc = await pool.query(
    `INSERT INTO documents (department_id, title, filename, storage_path, visibility, status)
     VALUES ($1, $2, 'file.pdf', 'uploads/file.pdf', $3, $4) RETURNING id`,
    [options.departmentId, options.title, options.visibility ?? "department", options.status ?? "ready"]
  );
  await pool.query(
    `INSERT INTO chunks (document_id, chunk_index, page_number, content, embedding, embedding_model)
     VALUES ($1, 0, 1, $2, $3::vector, 'test-model')`,
    [doc.rows[0].id, options.text ?? `${options.title}: students need 75 percent attendance.`, unitVector(0)]
  );
  return doc.rows[0].id as string;
}

// Rate limits count per calendar minute. Make sure a test that fires many
// requests cannot straddle a minute boundary and flake.
export async function ensureTimeLeftInMinute(ms = 8000) {
  const left = 60000 - (Date.now() % 60000);
  if (left < ms) await new Promise((resolve) => setTimeout(resolve, left + 50));
}

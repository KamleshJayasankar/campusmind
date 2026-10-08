import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../../db";
import { requireAuth } from "../../middleware/auth";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  departmentSlug: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(user: { id: string; role: string; department_id: string | null }) {
  return jwt.sign(
    { id: user.id, role: user.role, departmentId: user.department_id },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
}

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { name, email, password, departmentSlug } = parsed.data;

  const dept = await pool.query("SELECT id FROM departments WHERE slug = $1", [departmentSlug]);
  if (dept.rowCount === 0) {
    return res.status(400).json({ error: "Unknown department" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      `INSERT INTO users (department_id, email, name, password_hash)
       VALUES ($1, lower($2), $3, $4)
       RETURNING id, name, email, role, department_id`,
      [dept.rows[0].id, email, name, passwordHash]
    );
    const user = result.rows[0];
    return res.status(201).json({ token: signToken(user), user });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    throw err;
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const { email, password } = parsed.data;

  const result = await pool.query(
    "SELECT id, name, email, role, department_id, password_hash FROM users WHERE email = lower($1)",
    [email]
  );
  const user = result.rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const { password_hash, ...safeUser } = user;
  return res.json({ token: signToken(user), user: safeUser });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, email, role, department_id FROM users WHERE id = $1",
    [req.user!.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user: result.rows[0] });
});

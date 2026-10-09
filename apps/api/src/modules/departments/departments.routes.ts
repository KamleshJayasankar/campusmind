import { Router } from "express";
import { pool } from "../../db";

export const departmentsRouter = Router();

departmentsRouter.get("/", async (_req, res) => {
  const result = await pool.query("SELECT id, name, slug FROM departments ORDER BY name");
  return res.json({ departments: result.rows });
});

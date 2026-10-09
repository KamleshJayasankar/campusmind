import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { pool } from "../../db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { enqueueIngestion } from "../../queue/ingestion.queue";

export const documentsRouter = Router();

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

documentsRouter.post(
  "/",
  requireAuth,
  requireRole("faculty", "admin"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "A PDF file (max 20 MB) is required" });
    }
    if (!req.user!.departmentId) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Your account has no department" });
    }

    const title =
      String(req.body?.title ?? "").trim() || req.file.originalname.replace(/\.pdf$/i, "");
    const visibility = req.body?.visibility === "college" ? "college" : "department";

    const result = await pool.query(
      `INSERT INTO documents (department_id, uploaded_by, title, filename, storage_path, visibility)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, filename, visibility, status, created_at`,
      [
        req.user!.departmentId,
        req.user!.id,
        title,
        req.file.originalname,
        path.join("uploads", req.file.filename),
        visibility,
      ]
    );
    const document = result.rows[0];

    try {
      await enqueueIngestion(document.id);
    } catch (err) {
      console.error(err);
      await pool.query(
        "UPDATE documents SET status = 'failed', error_message = $2 WHERE id = $1",
        [document.id, "Could not queue for processing"]
      );
      return res.status(503).json({ error: "Upload saved, but processing could not be queued" });
    }

    return res.status(201).json({ document });
  }
);

documentsRouter.get("/", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, filename, visibility, status, error_message, page_count, created_at
     FROM documents
     WHERE department_id = $1 OR visibility = 'college'
     ORDER BY created_at DESC`,
    [req.user!.departmentId]
  );
  return res.json({ documents: result.rows });
});

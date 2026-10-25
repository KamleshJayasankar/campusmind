import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../../db";
import { bumpDocsVersion } from "../../cache";
import { AuthUser, requireAuth, requireRole } from "../../middleware/auth";
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

const idSchema = z.string().uuid();
const renameSchema = z.object({ title: z.string().trim().min(1).max(200) });

// Admins can manage every document; faculty only the ones they uploaded.
// Anything else is reported as "not found" so other people's documents are not revealed.
async function findManageableDocument(id: string, user: AuthUser) {
  const result = await pool.query(
    "SELECT id, status, storage_path, uploaded_by FROM documents WHERE id = $1",
    [id]
  );
  const doc = result.rows[0];
  if (!doc) return null;
  if (user.role !== "admin" && doc.uploaded_by !== user.id) return null;
  return doc as { id: string; status: string; storage_path: string; uploaded_by: string | null };
}

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
  const user = req.user!;
  const isStaff = user.role === "faculty" || user.role === "admin";
  const result = await pool.query(
    `SELECT id, title, filename, visibility, status, error_message, page_count, created_at,
            COALESCE($2::boolean AND ($3::boolean OR uploaded_by = $4::uuid), false) AS can_manage
     FROM documents
     WHERE department_id = $1 OR visibility = 'college'
     ORDER BY created_at DESC`,
    [user.departmentId, isStaff, user.role === "admin", user.id]
  );
  return res.json({ documents: result.rows });
});

documentsRouter.patch("/:id", requireAuth, requireRole("faculty", "admin"), async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    return res.status(400).json({ error: "Invalid document id" });
  }
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const doc = await findManageableDocument(id.data, req.user!);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const result = await pool.query(
    `UPDATE documents SET title = $2 WHERE id = $1
     RETURNING id, title, filename, visibility, status, error_message, page_count, created_at`,
    [doc.id, parsed.data.title]
  );
  // Cached answers contain the old title in their sources, so retire them.
  await bumpDocsVersion();
  return res.json({ document: { ...result.rows[0], can_manage: true } });
});

documentsRouter.delete("/:id", requireAuth, requireRole("faculty", "admin"), async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    return res.status(400).json({ error: "Invalid document id" });
  }
  const doc = await findManageableDocument(id.data, req.user!);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.status === "processing") {
    return res.status(409).json({ error: "This document is still being processed. Try again in a minute." });
  }

  // Its chunks are removed automatically (ON DELETE CASCADE).
  await pool.query("DELETE FROM documents WHERE id = $1", [doc.id]);
  fs.rm(path.join(process.cwd(), doc.storage_path), { force: true }, () => {});
  await bumpDocsVersion();
  return res.status(204).send();
});

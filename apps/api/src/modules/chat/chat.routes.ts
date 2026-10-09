import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db";
import { requireAuth } from "../../middleware/auth";
import { answerQuestion, HttpError } from "./chat.service";

export const chatRouter = Router();

const askSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  chatId: z.string().uuid().optional(),
});

chatRouter.post("/", requireAuth, async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  try {
    const result = await answerQuestion(req.user!, parsed.data.question, parsed.data.chatId);
    return res.json(result);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

chatRouter.get("/", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, title, created_at FROM chats WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [req.user!.id]
  );
  return res.json({ chats: result.rows });
});

chatRouter.get("/:id", requireAuth, async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: "Invalid chat id" });
  }
  const chat = await pool.query("SELECT id, title FROM chats WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.user!.id,
  ]);
  if (chat.rowCount === 0) return res.status(404).json({ error: "Chat not found" });
  const messages = await pool.query(
    "SELECT id, role, content, sources, feedback, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at, id",
    [req.params.id]
  );
  return res.json({ chat: chat.rows[0], messages: messages.rows });
});

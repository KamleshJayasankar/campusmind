import { pool } from "../../db";
import { AuthUser } from "../../middleware/auth";
import { getEmbeddingProvider } from "../../ai/embeddings";
import { generateAnswer } from "../../ai/generation";

const TOP_K = 5;
const MIN_SCORE = Number(process.env.MIN_SCORE ?? 0.4);
export const NOT_FOUND_ANSWER = "I couldn't find this in the uploaded documents.";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type RetrievedChunk = {
  documentId: string;
  title: string;
  page: number | null;
  content: string;
  score: number;
};

async function retrieve(question: string, departmentId: string | null): Promise<RetrievedChunk[]> {
  const queryEmbedding = await getEmbeddingProvider().embedQuery(question);
  const result = await pool.query(
    `SELECT d.id AS document_id, d.title, c.page_number, c.content,
            1 - (c.embedding <=> $1::vector) AS score
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.status = 'ready' AND (d.department_id = $2 OR d.visibility = 'college')
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(queryEmbedding), departmentId, TOP_K]
  );
  return result.rows.map((r) => ({
    documentId: r.document_id,
    title: r.title,
    page: r.page_number,
    content: r.content,
    score: Number(r.score),
  }));
}

export async function answerQuestion(user: AuthUser, question: string, chatId?: string) {
  if (chatId) {
    const own = await pool.query("SELECT 1 FROM chats WHERE id = $1 AND user_id = $2", [chatId, user.id]);
    if (own.rowCount === 0) throw new HttpError(404, "Chat not found");
  }

  const chunks = await retrieve(question, user.departmentId);
  console.log("retrieval scores:", chunks.map((c) => c.score.toFixed(3)).join(", ") || "none");

  let answer = NOT_FOUND_ANSWER;
  let sources: { index: number; documentId: string; title: string; page: number | null; score: number; snippet: string }[] = [];

  if (chunks.length > 0 && chunks[0].score >= MIN_SCORE) {
    const relevant = chunks.filter((c) => c.score >= MIN_SCORE);
    answer = await generateAnswer(
      question,
      relevant.map((c, i) => ({ index: i + 1, title: c.title, page: c.page, content: c.content }))
    );
    sources = relevant.map((c, i) => ({
      index: i + 1,
      documentId: c.documentId,
      title: c.title,
      page: c.page,
      score: Number(c.score.toFixed(3)),
      snippet: c.content.slice(0, 200),
    }));

    if (answer.includes("couldn't find this in the uploaded documents")) {
      sources = [];
    } else {
      const cited = new Set(
        [...answer.matchAll(/\[([\d,\s]+)\]/g)].flatMap((m) => m[1].split(",").map((n) => Number(n.trim())))
      );
      if (cited.size > 0) sources = sources.filter((s) => cited.has(s.index));
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let id = chatId;
    if (!id) {
      const created = await client.query(
        "INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id",
        [user.id, question.slice(0, 60)]
      );
      id = created.rows[0].id as string;
    }
    await client.query(
      "INSERT INTO messages (chat_id, role, content, created_at) VALUES ($1, 'user', $2, clock_timestamp())",
      [id, question]
    );
    const saved = await client.query(
      "INSERT INTO messages (chat_id, role, content, sources, created_at) VALUES ($1, 'assistant', $2, $3::jsonb, clock_timestamp()) RETURNING id",
      [id, answer, JSON.stringify(sources)]
    );
    await client.query("COMMIT");
    return { chatId: id, messageId: saved.rows[0].id as string, answer, sources };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

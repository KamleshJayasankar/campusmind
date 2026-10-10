import crypto from "crypto";
import { pool } from "../../db";
import { redis } from "../../cache";
import { AuthUser } from "../../middleware/auth";
import { getEmbeddingProvider } from "../../ai/embeddings";
import { generateAnswer } from "../../ai/generation";

const TOP_K = 5;
const MIN_SCORE = Number(process.env.MIN_SCORE ?? 0.4);
const CACHE_TTL_SECONDS = 6 * 60 * 60;
export const NOT_FOUND_ANSWER = "I couldn't find this in the uploaded documents.";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type RetrievedChunk = {
  documentId: string;
  title: string;
  page: number | null;
  content: string;
  score: number;
};

type Source = {
  index: number;
  documentId: string;
  title: string;
  page: number | null;
  score: number;
  snippet: string;
};

type CachedAnswer = { answer: string; sources: Source[] };

export async function retrieve(question: string, departmentId: string | null): Promise<RetrievedChunk[]> {
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

export async function answerFromChunks(question: string, chunks: RetrievedChunk[]): Promise<CachedAnswer> {
  if (chunks.length === 0 || chunks[0].score < MIN_SCORE) {
    return { answer: NOT_FOUND_ANSWER, sources: [] };
  }

  const relevant = chunks.filter((c) => c.score >= MIN_SCORE);
  const answer = await generateAnswer(
    question,
    relevant.map((c, i) => ({ index: i + 1, title: c.title, page: c.page, content: c.content }))
  );

  let sources: Source[] = relevant.map((c, i) => ({
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
  return { answer, sources };
}

async function generateWithSources(question: string, departmentId: string | null): Promise<CachedAnswer> {
  const chunks = await retrieve(question, departmentId);
  console.log("retrieval scores:", chunks.map((c) => c.score.toFixed(3)).join(", ") || "none");
  return answerFromChunks(question, chunks);
}

// The cache key includes a "docs version" that changes whenever a document is
// (re)processed, so cached answers never outlive the documents they came from.
async function getCacheKey(question: string, departmentId: string | null) {
  try {
    const version = (await redis.get("docs:version")) ?? "0";
    const normalized = question.toLowerCase().replace(/\s+/g, " ").trim();
    const hash = crypto.createHash("sha1").update(normalized).digest("hex");
    return `ans:${departmentId ?? "none"}:${version}:${hash}`;
  } catch {
    return null;
  }
}

export async function answerQuestion(user: AuthUser, question: string, chatId?: string) {
  if (chatId) {
    const own = await pool.query("SELECT 1 FROM chats WHERE id = $1 AND user_id = $2", [chatId, user.id]);
    if (own.rowCount === 0) throw new HttpError(404, "Chat not found");
  }

  const cacheKey = await getCacheKey(question, user.departmentId);
  let result: CachedAnswer | null = null;
  if (cacheKey) {
    try {
      const hit = await redis.get(cacheKey);
      if (hit) {
        result = JSON.parse(hit) as CachedAnswer;
        console.log("cache hit");
      }
    } catch {
      result = null;
    }
  }

  if (!result) {
    result = await generateWithSources(question, user.departmentId);
    if (cacheKey) {
      redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL_SECONDS).catch(() => {});
    }
  }
  const { answer, sources } = result;

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

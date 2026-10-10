import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "../src/db";
import { redis } from "../src/cache";
import { answerFromChunks, NOT_FOUND_ANSWER, retrieve } from "../src/modules/chat/chat.service";

type Question = {
  question: string;
  answerable: boolean;
  /** Part of the title of the document the answer should come from. */
  expectDocument?: string;
  /** Every one of these must appear in the answer (case-insensitive). */
  mustInclude?: string[];
};

type Result = {
  question: string;
  answerable: boolean;
  topScore: number;
  retrievalHit: boolean | null;
  refused: boolean;
  pass: boolean;
  error?: string;
  ms: number;
  answer: string;
};

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${n}/${d} (${Math.round((100 * n) / d)}%)`);

async function main() {
  const deptSlug = arg("dept");
  if (!deptSlug) throw new Error("Usage: npm run eval -- --dept <department-slug> [--limit N] [--delay ms] [--file path]");
  const file = arg("file", path.join(__dirname, "questions.json"))!;
  const delayMs = Number(arg("delay", "4000"));
  const limit = Number(arg("limit", "0"));

  const dept = await pool.query("SELECT id FROM departments WHERE slug = $1", [deptSlug]);
  if (dept.rowCount === 0) throw new Error(`Unknown department slug: ${deptSlug}`);
  const departmentId = dept.rows[0].id as string;

  let questions: Question[] = JSON.parse(fs.readFileSync(file, "utf8"));
  if (limit > 0) questions = questions.slice(0, limit);

  const minScore = Number(process.env.MIN_SCORE ?? 0.4);
  console.log(`Running ${questions.length} questions (MIN_SCORE=${minScore}, delay ${delayMs} ms)\n`);

  const results: Result[] = [];
  for (const [i, q] of questions.entries()) {
    const started = Date.now();
    try {
      const chunks = await retrieve(q.question, departmentId);
      const { answer } = await answerFromChunks(q.question, chunks);
      const refused = answer.includes("couldn't find this in the uploaded documents");
      const retrievalHit =
        q.answerable && q.expectDocument
          ? chunks.some((c) => c.title.toLowerCase().includes(q.expectDocument!.toLowerCase()))
          : null;
      const pass = q.answerable
        ? !refused && (q.mustInclude ?? []).every((k) => answer.toLowerCase().includes(k.toLowerCase()))
        : refused;
      results.push({
        question: q.question,
        answerable: q.answerable,
        topScore: chunks[0]?.score ?? 0,
        retrievalHit,
        refused,
        pass,
        ms: Date.now() - started,
        answer,
      });
    } catch (err) {
      results.push({
        question: q.question,
        answerable: q.answerable,
        topScore: 0,
        retrievalHit: null,
        refused: false,
        pass: false,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - started,
        answer: "",
      });
    }
    const r = results[results.length - 1]!;
    console.log(`${r.pass ? "PASS" : "FAIL"}  score ${r.topScore.toFixed(2)}  ${q.question}${r.error ? `  [error: ${r.error}]` : ""}`);
    if (i < questions.length - 1) await sleep(delayMs);
  }

  const ok = results.filter((r) => !r.error);
  const answerable = ok.filter((r) => r.answerable);
  const unanswerable = ok.filter((r) => !r.answerable);
  const withDoc = answerable.filter((r) => r.retrievalHit !== null);
  const failures = results.filter((r) => !r.pass);

  console.log("\n=== Summary ===");
  console.log(`Retrieval hit rate (right document in top 5): ${pct(withDoc.filter((r) => r.retrievalHit).length, withDoc.length)}`);
  console.log(`Answer accuracy (answerable questions):       ${pct(answerable.filter((r) => r.pass).length, answerable.length)}`);
  console.log(`Correct refusals (unanswerable questions):    ${pct(unanswerable.filter((r) => r.pass).length, unanswerable.length)}`);
  console.log(`Overall:                                      ${pct(results.filter((r) => r.pass).length, results.length)}`);
  console.log(`Average time per question:                    ${Math.round(ok.reduce((a, r) => a + r.ms, 0) / Math.max(ok.length, 1))} ms`);
  if (results.length > ok.length) console.log(`Errors (not scored):                          ${results.length - ok.length}`);

  if (answerable.length > 0 && unanswerable.length > 0) {
    const lowestAnswerable = Math.min(...answerable.map((r) => r.topScore));
    const highestUnanswerable = Math.max(...unanswerable.map((r) => r.topScore));
    console.log(`\nTop similarity score: answerable min ${lowestAnswerable.toFixed(2)}, unanswerable max ${highestUnanswerable.toFixed(2)}`);
    if (lowestAnswerable > highestUnanswerable) {
      console.log(`A MIN_SCORE of about ${((lowestAnswerable + highestUnanswerable) / 2).toFixed(2)} separates them cleanly.`);
    } else {
      console.log("The score ranges overlap, so no MIN_SCORE separates them. The model's own refusal covers the gap.");
    }
  }

  if (failures.length > 0) {
    console.log("\n=== Failures ===");
    for (const r of failures) {
      console.log(`- ${r.question}`);
      console.log(`  score ${r.topScore.toFixed(2)} | ${r.answerable ? (r.refused ? "refused but should answer" : "answer missing expected text") : "should have refused"}`);
      console.log(`  answer: ${r.error ?? r.answer.slice(0, 200)}`);
    }
  }

  fs.writeFileSync(
    path.join(__dirname, "results.json"),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        embeddingModel: process.env.EMBEDDING_MODEL ?? "gemini-embedding-001",
        generationModel: process.env.GENERATION_MODEL ?? "gemini-3.1-flash-lite",
        minScore,
        total: results.length,
        passed: results.filter((r) => r.pass).length,
        results: results.map(({ answer, ...rest }) => ({ ...rest, answer: answer.slice(0, 300) })),
      },
      null,
      2
    )
  );
  console.log("\nSaved eval/results.json");
  await pool.end();
  redis.disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await pool.end().catch(() => {});
  redis.disconnect();
  process.exit(1);
});

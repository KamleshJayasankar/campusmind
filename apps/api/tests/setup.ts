import { afterAll, vi } from "vitest";
import { pool } from "../src/db";
import { redis } from "../src/cache";

// Never touch the real job queue, embedding API or generation API in tests.
vi.mock("../src/queue/ingestion.queue", () => ({
  INGESTION_QUEUE: "ingestion",
  ingestionQueue: {},
  enqueueIngestion: vi.fn(async () => undefined),
}));

vi.mock("../src/ai/embeddings", () => {
  const unit = (i: number) => Array.from({ length: 768 }, (_, k) => (k === i ? 1 : 0));
  return {
    EMBEDDING_DIMENSIONS: 768,
    getEmbeddingProvider: () => ({
      model: "test-model",
      embedDocuments: async (texts: string[]) => texts.map(() => unit(0)),
      // Questions containing "unrelated" point in a different direction, so nothing matches them.
      embedQuery: async (question: string) => (question.includes("unrelated") ? unit(1) : unit(0)),
    }),
  };
});

vi.mock("../src/ai/generation", () => ({
  generateAnswer: vi.fn(async () => "Minimum attendance is 75 percent [1]."),
}));

afterAll(async () => {
  await pool.end();
  redis.disconnect();
});

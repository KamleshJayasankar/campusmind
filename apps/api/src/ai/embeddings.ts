export const EMBEDDING_DIMENSIONS = 768;

export interface EmbeddingProvider {
  readonly model: string;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class GeminiEmbeddings implements EmbeddingProvider {
  constructor(
    private apiKey: string,
    readonly model: string,
    private baseUrl: string
  ) {}

  private async batch(texts: string[], taskType: string): Promise<number[][]> {
    const url = `${this.baseUrl}/models/${this.model}:batchEmbedContents`;
    const body = JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    });

    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body,
      });
      if (res.ok) {
        const json = (await res.json()) as { embeddings: { values: number[] }[] };
        const vectors = json.embeddings.map((e) => e.values);
        if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
          throw new Error(`Embedding API returned unexpected shape (expected ${EMBEDDING_DIMENSIONS} dimensions)`);
        }
        return vectors;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await sleep(2000 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`Embedding API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    throw new Error("Embedding API failed");
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 50) {
      out.push(...(await this.batch(texts.slice(i, i + 50), "RETRIEVAL_DOCUMENT")));
    }
    return out;
  }

  async embedQuery(text: string): Promise<number[]> {
    return (await this.batch([text], "RETRIEVAL_QUERY"))[0];
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in apps/api/.env");
  return new GeminiEmbeddings(
    key,
    process.env.EMBEDDING_MODEL ?? "gemini-embedding-001",
    process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"
  );
}

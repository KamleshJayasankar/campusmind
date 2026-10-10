import type { PageText } from "./chunker";

// A request may be about 20 MB and base64 adds roughly 33%, so keep the PDF itself below this.
const MAX_INLINE_BYTES = 14 * 1024 * 1024;

const PROMPT = `Transcribe all text in this document exactly as written, including headings, numbered lists and table contents.
Output plain text only, with no commentary and no markdown.
Begin each page with a line in exactly this form: === PAGE n === (n starts at 1).
If a page has no readable text, still output its marker line.`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function splitOcrPages(raw: string): PageText[] {
  // Splitting with a capture group gives: [before, "1", text1, "2", text2, ...]
  const parts = raw.split(/^=== PAGE (\d+) ===\s*$/m);
  const pages: PageText[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    pages.push({ num: Number(parts[i]), text: (parts[i + 1] ?? "").trim() });
  }
  if (pages.length === 0 && raw.trim()) return [{ num: 1, text: raw.trim() }];
  return pages;
}

/** Reads a scanned PDF by sending it to Gemini, which can see the page images. */
export async function ocrPdf(buffer: Buffer): Promise<PageText[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  if (buffer.length > MAX_INLINE_BYTES) {
    throw new Error("This scanned PDF is too large to read automatically (limit about 14 MB)");
  }

  const model = process.env.OCR_MODEL ?? process.env.GENERATION_MODEL ?? "gemini-3.1-flash-lite";
  const baseUrl = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: "application/pdf", data: buffer.toString("base64") } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 32768 },
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${baseUrl}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
    });
    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      };
      const candidate = json.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (candidate?.finishReason === "MAX_TOKENS") {
        console.warn("OCR output was cut off (very long document); keeping what was read");
      }
      return splitOcrPages(text);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(2000 * 2 ** (attempt - 1));
      continue;
    }
    throw new Error(`OCR API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error("OCR API failed");
}

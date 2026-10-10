import { afterEach, describe, expect, it, vi } from "vitest";
import { ocrPdf, splitOcrPages } from "../src/ingestion/ocr";

describe("splitOcrPages", () => {
  it("splits the transcription on page markers", () => {
    const pages = splitOcrPages("=== PAGE 1 ===\nFirst page text\n=== PAGE 2 ===\nSecond page text\n");
    expect(pages).toEqual([
      { num: 1, text: "First page text" },
      { num: 2, text: "Second page text" },
    ]);
  });

  it("treats the whole output as page 1 when the model forgets the markers", () => {
    expect(splitOcrPages("Just some text")).toEqual([{ num: 1, text: "Just some text" }]);
  });

  it("returns nothing for empty output", () => {
    expect(splitOcrPages("   ")).toEqual([]);
  });
});

describe("ocrPdf", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the PDF to Gemini and returns the pages it reads", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "=== PAGE 1 ===\nGrace period is 5 minutes." }] }, finishReason: "STOP" }],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const pages = await ocrPdf(Buffer.from("%PDF-1.4 fake"));
    expect(pages).toEqual([{ num: 1, text: "Grace period is 5 minutes." }]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain(":generateContent");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const sent = JSON.parse(init!.body as string);
    expect(sent.contents[0].parts[0].inline_data.mime_type).toBe("application/pdf");
  });

  it("refuses PDFs that are too large to send", async () => {
    await expect(ocrPdf(Buffer.alloc(15 * 1024 * 1024))).rejects.toThrow(/too large/);
  });

  it("reports API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key", { status: 403 })));
    await expect(ocrPdf(Buffer.from("%PDF-1.4"))).rejects.toThrow(/OCR API error 403/);
  });
});

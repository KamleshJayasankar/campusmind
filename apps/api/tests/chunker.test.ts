import { describe, expect, it } from "vitest";
import { chunkPages } from "../src/ingestion/chunker";

describe("chunkPages", () => {
  it("returns no chunks for blank pages", () => {
    expect(chunkPages([{ num: 1, text: "   \n\t " }])).toEqual([]);
  });

  it("keeps short text as one chunk and remembers the page number", () => {
    const chunks = chunkPages([{ num: 3, text: "Students must keep 75 percent attendance." }]);
    expect(chunks).toEqual([{ pageNumber: 3, content: "Students must keep 75 percent attendance." }]);
  });

  it("collapses runs of whitespace", () => {
    const chunks = chunkPages([{ num: 1, text: "Exam   fee\n\nis due   on Monday for everyone." }]);
    expect(chunks[0]?.content).toBe("Exam fee is due on Monday for everyone.");
  });

  it("splits long text into chunks of at most 1000 characters", () => {
    const text = "Students must maintain attendance. ".repeat(80);
    const chunks = chunkPages([{ num: 1, text }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(1000);
  });

  it("prefers to break chunks at the end of a sentence", () => {
    const text = "Students must maintain attendance. ".repeat(80);
    const chunks = chunkPages([{ num: 1, text }]);
    for (const chunk of chunks) expect(chunk.content.endsWith(".")).toBe(true);
  });

  it("overlaps neighbouring chunks so context is not lost at the edges", () => {
    const text = "Students must maintain attendance. ".repeat(80);
    const [first, second] = chunkPages([{ num: 1, text }]);
    expect(first!.content).toContain(second!.content.slice(0, 40));
  });

  it("always makes progress on text with no sentence breaks", () => {
    const chunks = chunkPages([{ num: 1, text: "a".repeat(5000) }]);
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((c) => c.content.length <= 1000)).toBe(true);
  });

  it("numbers chunks by the page they came from", () => {
    const chunks = chunkPages([
      { num: 1, text: "First page has enough text to keep." },
      { num: 2, text: "" },
      { num: 3, text: "Third page also has enough text." },
    ]);
    expect(chunks.map((c) => c.pageNumber)).toEqual([1, 3]);
  });
});

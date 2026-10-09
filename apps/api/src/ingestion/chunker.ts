export type PageText = { num: number; text: string };
export type Chunk = { pageNumber: number; content: string };

const MAX_CHARS = 1000;
const OVERLAP = 150;

export function chunkPages(pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const page of pages) {
    const text = page.text.replace(/\s+/g, " ").trim();
    if (!text) continue;

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + MAX_CHARS, text.length);

      if (end < text.length) {
        const slice = text.slice(start, end);
        const lastBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
        if (lastBreak > MAX_CHARS * 0.5) end = start + lastBreak + 1;
      }

      const content = text.slice(start, end).trim();
      if (content.length >= 20) chunks.push({ pageNumber: page.num, content });

      if (end >= text.length) break;
      start = Math.max(end - OVERLAP, start + 1);
    }
  }
  return chunks;
}

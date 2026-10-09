import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { pool } from "../db";
import { getEmbeddingProvider } from "../ai/embeddings";
import { chunkPages } from "./chunker";
import { bumpDocsVersion } from "../cache";

export async function processDocument(documentId: string) {
  const found = await pool.query("SELECT storage_path FROM documents WHERE id = $1", [documentId]);
  if (found.rowCount === 0) throw new Error("Document not found");

  await pool.query("UPDATE documents SET status = 'processing', error_message = NULL WHERE id = $1", [documentId]);

  try {
    const buffer = await fs.promises.readFile(path.join(process.cwd(), found.rows[0].storage_path));
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let pages: { num: number; text: string }[];
    try {
      pages = (await parser.getText()).pages;
    } finally {
      await parser.destroy();
    }

    const chunks = chunkPages(pages);
    if (chunks.length === 0) throw new Error("No extractable text found (scanned PDF?)");

    const provider = getEmbeddingProvider();
    const embeddings = await provider.embedDocuments(chunks.map((c) => c.content));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM chunks WHERE document_id = $1", [documentId]);
      for (let i = 0; i < chunks.length; i++) {
        await client.query(
          `INSERT INTO chunks (document_id, chunk_index, page_number, content, embedding, embedding_model)
           VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [documentId, i, chunks[i].pageNumber, chunks[i].content, JSON.stringify(embeddings[i]), provider.model]
        );
      }
      await client.query("UPDATE documents SET status = 'ready', page_count = $2 WHERE id = $1", [documentId, pages.length]);
      await client.query("COMMIT");
      await bumpDocsVersion();
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query("UPDATE documents SET status = 'failed', error_message = $2 WHERE id = $1", [documentId, message.slice(0, 500)]);
    throw err;
  }
}

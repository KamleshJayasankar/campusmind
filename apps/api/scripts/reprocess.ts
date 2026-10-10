import "dotenv/config";
import { pool } from "../src/db";
import { redis } from "../src/cache";
import { processDocument } from "../src/ingestion/processDocument";

// Usage: npm run reprocess            (retries every failed document)
//        npm run reprocess -- <id>    (retries specific documents)
async function main() {
  const given = process.argv.slice(2);
  const ids =
    given.length > 0
      ? given
      : (await pool.query("SELECT id FROM documents WHERE status = 'failed' ORDER BY created_at")).rows.map(
          (r) => r.id as string
        );

  if (ids.length === 0) console.log("Nothing to reprocess.");
  for (const id of ids) {
    console.log(`Processing ${id} ...`);
    try {
      await processDocument(id);
      console.log("  ready");
    } catch (err) {
      console.log(`  failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  await pool.end();
  redis.disconnect();
}

main();

import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "./redis";
import { INGESTION_QUEUE } from "./queue/ingestion.queue";
import { processDocument } from "./ingestion/processDocument";

const worker = new Worker(
  INGESTION_QUEUE,
  async (job) => {
    await processDocument(job.data.documentId);
  },
  { connection: redisConnection, concurrency: 1 }
);

worker.on("completed", (job) => console.log(`Document ${job.data.documentId} ingested`));
worker.on("failed", (job, err) => console.error(`Document ${job?.data.documentId} failed: ${err.message}`));

console.log("Ingestion worker started");

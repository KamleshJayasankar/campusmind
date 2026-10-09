import { Queue } from "bullmq";
import { redisConnection } from "../redis";

export const INGESTION_QUEUE = "ingestion";

export const ingestionQueue = new Queue(INGESTION_QUEUE, {
  connection: redisConnection,
});

export function enqueueIngestion(documentId: string) {
  return ingestionQueue.add(
    "ingest",
    { documentId },
    { removeOnComplete: true, removeOnFail: 100 }
  );
}

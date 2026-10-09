import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 1,
});

redis.on("error", (err) => console.error("Redis error:", err.message));

export async function bumpDocsVersion() {
  try {
    await redis.incr("docs:version");
  } catch (err) {
    console.error("Could not bump docs version:", err);
  }
}

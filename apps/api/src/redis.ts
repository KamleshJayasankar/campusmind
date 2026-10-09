const url = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

export const redisConnection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  password: url.password || undefined,
  ...(url.protocol === "rediss:" ? { tls: {} } : {}),
};

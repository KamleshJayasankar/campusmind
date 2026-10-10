import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
});

// Hosted databases (like Neon) close idle connections. Without this handler,
// that would crash the whole process with an unhandled "error" event.
pool.on("error", (err) => {
  console.error("Idle database connection error:", err.message);
});

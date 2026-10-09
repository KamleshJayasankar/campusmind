import { defineConfig } from "vitest/config";

// Tests run against a separate "campusmind_test" database and Redis DB 1,
// so they can never touch your development data.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://campusmind:campusmind@127.0.0.1:5433/campusmind_test",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/1",
      JWT_SECRET: "test-secret",
      GEMINI_API_KEY: "test-key",
      MIN_SCORE: "0.4",
    },
  },
});

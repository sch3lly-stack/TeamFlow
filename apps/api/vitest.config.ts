import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://teamflow:teamflow@localhost:5432/teamflow_test?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: "test-only-access-secret-that-is-long-enough",
      RATE_LIMIT_DISABLED: "true",
      UPLOAD_DIR: "./uploads-test",
      COOKIE_SECURE: "false",
      CLIENT_ORIGIN: "http://localhost:5173",
    },
  },
});

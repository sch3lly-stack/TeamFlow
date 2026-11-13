import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", seed: "prisma/seed.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  splitting: false,
});

import { defineConfig } from "vitest/config";

// Relative base so the build works under https://<user>.github.io/black-hole/ and any other path.
export default defineConfig({
  base: "./",
  build: { target: "es2022", assetsInlineLimit: 0 },
  test: { include: ["tests/**/*.test.ts"] },
});

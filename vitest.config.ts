import { defineConfig } from "vitest/config";

// Unit tests for pure Worker logic. Kept separate from vite.config.ts so the Cloudflare plugin is not loaded.
export default defineConfig({
  test: { include: ["worker/lib/__tests__/**/*.test.ts"], maxWorkers: 2 },
});

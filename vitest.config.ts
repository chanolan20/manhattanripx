import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Run test files sequentially — SQLite cannot be opened by multiple processes at once
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // Each test file gets its own isolated DB via DB_PATH env
    isolate: true,
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["server/**/*.ts"],
      exclude: ["server/vite.ts", "server/index.ts"],
      thresholds: {
        lines: 65,
        functions: 70,
        branches: 55,
        statements: 65,
      },
      // Note: print.ts CUPS/IPP paths (lines 60-166) are not testable without
      // real printer hardware. Thresholds account for this intentional gap.
    },
    testTimeout: 30000,
    hookTimeout: 20000,
    reporters: ["verbose"],
    sequence: {
      // run unit tests before integration
      shuffle: false,
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});

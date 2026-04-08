import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
      "server-only": path.resolve(process.cwd(), "test/server-only-stub.js")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.{js,jsx}"],
    exclude: ["node_modules/**", ".next/**"]
  }
});

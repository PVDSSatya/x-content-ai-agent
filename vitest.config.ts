import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "markdown-text-loader",
      transform(code, id) {
        if (id.endsWith(".md")) {
          return { code: `export default ${JSON.stringify(code)};`, map: null };
        }
      },
    },
  ],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "prompts/",
        "config/",
        "migrations/",
        "*.config.ts",
        "*.config.js",
      ],
    },
    testTimeout: 30000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
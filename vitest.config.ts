import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "apps/**/*.{test,spec}.{ts,tsx}",
      "packages/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "apps/web/lib/**/*.ts",
        "packages/razorpay/src/**/*.ts",
        "packages/db/src/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/seed.ts"],
    },
  },
  resolve: {
    alias: {
      // Map workspace imports so unit tests don't need node_modules symlinks
      "@tu/db": new URL("./packages/db/src/index.ts", import.meta.url).pathname,
      "@tu/razorpay": new URL("./packages/razorpay/src/index.ts", import.meta.url).pathname,
    },
  },
});

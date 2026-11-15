import { configDefaults, defineConfig } from "vitest/config";

// Unit tests only. Database tests live in test/db and run via `test:db`.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/db/**"],
  },
});

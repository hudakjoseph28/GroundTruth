import { defineConfig } from "vitest/config";

// Runs against the database in DATABASE_URL (backend/.env locally) after
// `db:migrate`. Tests create and delete their own rows.
try {
  process.loadEnvFile(".env");
} catch {
  // CI and hosted runs provide DATABASE_URL directly.
}

export default defineConfig({
  test: {
    include: ["test/db/**/*.test.ts"],
    fileParallelism: false,
  },
});

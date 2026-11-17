import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The browser calls relative /api/... paths. Vercel forwards them to the API
// in production (vercel.json); dev and preview forward them here. Point
// GROUNDTRUTH_API at another API, such as the Railway URL, to use it instead
// of a local `pnpm --filter @groundtruth/backend dev` on port 3001.
const api = { "/api": process.env.GROUNDTRUTH_API ?? "http://localhost:3001" };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: api,
  },
  preview: {
    proxy: api,
  },
});

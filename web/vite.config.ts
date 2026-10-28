import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // in dev the API runs on port 3000, so the cookie stays on one origin
  server: { proxy: { "/api": "http://localhost:3000" } },
});

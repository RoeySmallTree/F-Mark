/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/sessions": "http://localhost:7777",
      "/participants": "http://localhost:7777",
      "/health": "http://localhost:7777",
      "/ws": { target: "ws://localhost:7777", ws: true },
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

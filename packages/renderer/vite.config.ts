/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      "/sessions": "http://localhost:7777",
      "/participants": "http://localhost:7777",
      "/managed-agents": "http://localhost:7777",
      "/runtimes": "http://localhost:7777",
      "/env-probe": "http://localhost:7777",
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
    /* In dev mode (`vite build --watch --mode development`) the watcher
       rebuilds dist/ on every save. If we empty dist/ on each rebuild, the
       kernel's static plugin briefly sees an empty directory and either
       (a) fails its initial registration check (race on first start) or
       (b) returns 404 for any request that lands in the empty window. So:
       only empty during a true production build. */
    emptyOutDir: mode === "production",
    /* Disable esbuild minification. esbuild mis-minifies xterm.js's
       block-scoped `DECRQMTypes` enum inside `InputHandler.requestMode`: it
       constant-folds `DECRQMTypes || (DECRQMTypes = {})` to `void 0 || (i = {})`
       but drops the `var i` declaration, so the very first DECRQM escape from a
       terminal throws `ReferenceError: i is not defined` and kills the panel.
       F-Mark is a locally-served kernel UI, not a CDN bundle, so unminified is
       the right trade: correct + debuggable. Revisit only if bundle weight ever
       matters (then prefer `minify: "terser"`, which handles the enum). */
    minify: false,
  },
}));

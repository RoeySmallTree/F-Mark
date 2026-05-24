import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { readState } from "../../src/state/store.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("routes /sessions", () => {
  it("POST /sessions creates a session", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/sessions",
        payload: { slug: "demo" },
      });
      expect(res.statusCode).toBe(200);
      const meta = res.json();
      expect(meta.id).toMatch(/-demo$/);
      await app.close();
    });
  });

  it("GET /sessions lists sessions", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      await app.inject({ method: "POST", url: "/sessions", payload: { slug: "a" } });
      await app.inject({ method: "POST", url: "/sessions", payload: { slug: "b" } });
      const res = await app.inject({ method: "GET", url: "/sessions" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessions.length).toBe(2);
      await app.close();
    });
  });

  it("requires bearer token when configured", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const res = await app.inject({ method: "GET", url: "/sessions" });
      expect(res.statusCode).toBe(401);
      const ok = await app.inject({
        method: "GET",
        url: "/sessions",
        headers: { authorization: "Bearer secret" },
      });
      expect(ok.statusCode).toBe(200);
      await app.close();
    });
  });

  it("accepts ?token=<token> query param when configured", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const ok = await app.inject({
        method: "GET",
        url: "/sessions?token=secret",
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.headers["set-cookie"]).toMatch(/fmark_token=secret/);
      const bad = await app.inject({
        method: "GET",
        url: "/sessions?token=wrong",
      });
      expect(bad.statusCode).toBe(401);
      await app.close();
    });
  });

  it("accepts fmark_token cookie on subsequent requests", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const ok = await app.inject({
        method: "GET",
        url: "/sessions",
        headers: { cookie: "fmark_token=secret" },
      });
      expect(ok.statusCode).toBe(200);
      const bad = await app.inject({
        method: "GET",
        url: "/sessions",
        headers: { cookie: "fmark_token=wrong" },
      });
      expect(bad.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("multi-path body.path", () => {
    it("creates a session at the chosen path and activates it", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-other-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(fallbackRoot);
          await initProject(p);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(fallbackRoot),
          });
          const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

          const res = await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "alt", path: otherRoot },
          });
          expect(res.statusCode).toBe(200);
          const meta = res.json();
          expect(meta.id).toMatch(/-alt$/);
          // Session folder created under the chosen path, not the fallback.
          expect(existsSync(join(otherRoot, ".f-mark", "sessions", meta.id))).toBe(true);
          expect(existsSync(join(fallbackRoot, ".f-mark", "sessions", meta.id))).toBe(false);
          // Ref + state.json updated.
          expect(ref.get().active?.root()).toBe(otherRoot);
          const state = await readState(g);
          expect(state.activePath).toBe(otherRoot);
          expect(state.knownPaths).toContain(otherRoot);
          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("400s when body.path doesn't exist", async () => {
      await withTempProject(async (root) => {
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(root);
          await initProject(p);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({ global: g, active: activePaths(root) });
          const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
          const res = await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "x", path: "/nope/does/not/exist" },
          });
          expect(res.statusCode).toBe(400);
          expect(res.json().code).toBe("PATH_NOT_FOUND");
          await app.close();
        } finally {
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("GET /sessions reads from active path after switch", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-other-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(fallbackRoot);
          await initProject(p);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({ global: g, active: activePaths(fallbackRoot) });
          const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

          // Create one in fallback path.
          await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "fallback-session" },
          });
          // Create one at the other path — activates it.
          await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "other-session", path: otherRoot },
          });

          const res = await app.inject({ method: "GET", url: "/sessions" });
          const ids = res.json().sessions.map((s: { id: string }) => s.id);
          expect(ids.some((id: string) => id.endsWith("-other-session"))).toBe(true);
          expect(ids.some((id: string) => id.endsWith("-fallback-session"))).toBe(false);
          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("GET /sessions returns [] when active path has no .f-mark/", async () => {
      const fresh = mkdtempSync(join(tmpdir(), "fmark-fresh-"));
      const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
      try {
        const p = paths(fresh);
        // Note: NO initProject — fresh dir has no .f-mark/.
        const g = globalPaths(configRoot);
        const ref = new PathContextRef({ global: g, active: activePaths(fresh) });
        const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
        const res = await app.inject({ method: "GET", url: "/sessions" });
        expect(res.statusCode).toBe(200);
        expect(res.json().sessions).toEqual([]);
        // listSessions must NOT have created .f-mark/ in the fresh dir.
        expect(existsSync(join(fresh, ".f-mark"))).toBe(false);
        await app.close();
      } finally {
        rmSync(fresh, { recursive: true, force: true });
        rmSync(configRoot, { recursive: true, force: true });
      }
    });
  });
});

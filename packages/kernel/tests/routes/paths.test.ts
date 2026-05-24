import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { registerPathRoutes } from "../../src/routes/paths.js";
import { readState } from "../../src/state/store.js";

interface Harness {
  app: FastifyInstance;
  configRoot: string;
  scratch: string;
  ref: PathContextRef;
}

async function makeHarness(): Promise<Harness> {
  const scratch = mkdtempSync(join(tmpdir(), "fmark-paths-route-"));
  const configRoot = join(scratch, "config");
  mkdirSync(configRoot, { recursive: true });
  const g = globalPaths(configRoot);
  const ref = new PathContextRef({ global: g, active: null });
  const app = Fastify();
  registerPathRoutes(app, ref);
  await app.ready();
  return { app, configRoot, scratch, ref };
}

async function tearDown(h: Harness): Promise<void> {
  await h.app.close();
  rmSync(h.scratch, { recursive: true, force: true });
}

describe("/paths routes", () => {
  let h: Harness;
  beforeEach(async () => { h = await makeHarness(); });
  afterEach(async () => { await tearDown(h); });

  describe("GET /paths", () => {
    it("returns default state when nothing has been written", async () => {
      const res = await h.app.inject({ method: "GET", url: "/paths" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        activePath: null,
        activeRevision: 0,
        knownPaths: [],
        favorites: [],
      });
    });
  });

  describe("POST /paths/active", () => {
    it("validates the path exists", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/paths/active",
        payload: { path: join(h.scratch, "no-such-dir") },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("PATH_NOT_FOUND");
    });

    it("rejects relative paths", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/paths/active",
        payload: { path: "./nope" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("PATH_NOT_ABSOLUTE");
    });

    it("sets active, bumps revision, pushes to knownPaths", async () => {
      const project = join(h.scratch, "project-a");
      mkdirSync(project);
      const res = await h.app.inject({
        method: "POST",
        url: "/paths/active",
        payload: { path: project },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.activePath).toBe(project);
      expect(body.activeRevision).toBe(1);
      expect(body.knownPaths).toEqual([project]);
      // Ref updated synchronously.
      expect(h.ref.get().active?.root()).toBe(project);
    });

    it("MRU-promotes a previously-known path", async () => {
      const a = join(h.scratch, "a");
      const b = join(h.scratch, "b");
      mkdirSync(a); mkdirSync(b);
      await h.app.inject({ method: "POST", url: "/paths/active", payload: { path: a } });
      await h.app.inject({ method: "POST", url: "/paths/active", payload: { path: b } });
      await h.app.inject({ method: "POST", url: "/paths/active", payload: { path: a } });
      const state = await readState(globalPaths(h.configRoot));
      expect(state.knownPaths).toEqual([a, b]);
      expect(state.activeRevision).toBe(3);
    });
  });

  describe("DELETE /paths/active", () => {
    it("clears active path and bumps revision", async () => {
      const project = join(h.scratch, "proj");
      mkdirSync(project);
      await h.app.inject({ method: "POST", url: "/paths/active", payload: { path: project } });
      const res = await h.app.inject({ method: "DELETE", url: "/paths/active" });
      expect(res.statusCode).toBe(200);
      expect(res.json().activePath).toBe(null);
      expect(res.json().activeRevision).toBe(2);
      expect(h.ref.get().active).toBe(null);
    });
  });

  describe("DELETE /paths/known", () => {
    it("removes a knownPath", async () => {
      const a = join(h.scratch, "a");
      const b = join(h.scratch, "b");
      mkdirSync(a); mkdirSync(b);
      await h.app.inject({ method: "POST", url: "/paths/active", payload: { path: a } });
      await h.app.inject({ method: "POST", url: "/paths/active", payload: { path: b } });
      const res = await h.app.inject({
        method: "DELETE",
        url: `/paths/known?path=${encodeURIComponent(a)}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().knownPaths).toEqual([b]);
    });

    it("400s without a path", async () => {
      const res = await h.app.inject({ method: "DELETE", url: "/paths/known" });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("favorites", () => {
    it("adds, lists, and removes", async () => {
      const a = "/home/me/projects/a";
      const add = await h.app.inject({
        method: "POST",
        url: "/paths/favorites",
        payload: { name: "Project A", path: a },
      });
      expect(add.statusCode).toBe(200);
      expect(add.json().favorites).toEqual([{ name: "Project A", path: a }]);

      const list = await h.app.inject({ method: "GET", url: "/paths" });
      expect(list.json().favorites).toEqual([{ name: "Project A", path: a }]);

      const rm = await h.app.inject({
        method: "DELETE",
        url: `/paths/favorites?path=${encodeURIComponent(a)}`,
      });
      expect(rm.statusCode).toBe(200);
      expect(rm.json().favorites).toEqual([]);
    });

    it("rejects duplicate path", async () => {
      const a = "/home/me/projects/a";
      await h.app.inject({
        method: "POST",
        url: "/paths/favorites",
        payload: { name: "Project A", path: a },
      });
      const dup = await h.app.inject({
        method: "POST",
        url: "/paths/favorites",
        payload: { name: "Other", path: a },
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().code).toBe("FAVORITE_EXISTS");
    });

    it("rejects relative paths", async () => {
      const res = await h.app.inject({
        method: "POST",
        url: "/paths/favorites",
        payload: { name: "x", path: "./a" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("PATH_NOT_ABSOLUTE");
    });

    it("renames via PATCH", async () => {
      const a = "/home/me/projects/a";
      await h.app.inject({
        method: "POST",
        url: "/paths/favorites",
        payload: { name: "Old", path: a },
      });
      const patch = await h.app.inject({
        method: "PATCH",
        url: "/paths/favorites",
        payload: { path: a, newName: "New" },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().favorites).toEqual([{ name: "New", path: a }]);
    });

    it("PATCH 404s when favorite is unknown", async () => {
      const res = await h.app.inject({
        method: "PATCH",
        url: "/paths/favorites",
        payload: { path: "/nothing", newName: "x" },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

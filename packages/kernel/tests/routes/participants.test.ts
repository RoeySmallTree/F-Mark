import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("routes /participants", () => {
  it("GET /participants returns config participants", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({ method: "GET", url: "/participants" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Object.keys(body.participants).length).toBe(1);
      await app.close();
    });
  });

  it("POST /participants/register creates an agent", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/participants/register",
        payload: { kind: "agent", name: "Claude" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toMatch(/^ag-/);
      await app.close();
    });
  });

  it("POST /participants/register rejects bad payload", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/participants/register",
        payload: { kind: "user" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("PATCH /participants/:id updates name + color and persists", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });

      // Look up the user id created by initProject.
      const listed = await app.inject({ method: "GET", url: "/participants" });
      const participants = listed.json().participants as Record<
        string,
        { kind: string; name: string; color: string }
      >;
      const userId = Object.entries(participants).find(
        ([, v]) => v.kind === "user",
      )![0];

      const res = await app.inject({
        method: "PATCH",
        url: `/participants/${userId}`,
        payload: { name: "Roey", color: "#2a5fa8" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(userId);
      expect(body.name).toBe("Roey");
      expect(body.color).toBe("#2a5fa8");

      // Verify the change persisted on disk.
      const refetched = await app.inject({
        method: "GET",
        url: "/participants",
      });
      const after = refetched.json().participants as Record<
        string,
        { name: string; color: string }
      >;
      expect(after[userId]!.name).toBe("Roey");
      expect(after[userId]!.color).toBe("#2a5fa8");
      await app.close();
    });
  });

  it("PATCH /participants/:id 404 on unknown id", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "PATCH",
        url: "/participants/us-ffff",
        payload: { name: "X" },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("PATCH /participants/:id rejects bad color", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const listed = await app.inject({ method: "GET", url: "/participants" });
      const userId = Object.entries(
        listed.json().participants as Record<string, { kind: string }>,
      ).find(([, v]) => v.kind === "user")![0];
      const res = await app.inject({
        method: "PATCH",
        url: `/participants/${userId}`,
        payload: { color: "not-a-color" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("multi-path scoping", () => {
    it("returns empty when the active path has no .f-mark/ yet", async () => {
      await withTempProject(async (fallbackRoot) => {
        const fresh = mkdtempSync(join(tmpdir(), "fmark-pt-fresh-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-pt-cfg-"));
        try {
          const fallback = paths(fallbackRoot);
          await initProject(fallback);
          // Note: fresh dir is NOT initialized — no .f-mark/.
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(fresh),
          });
          const { app } = createServer({
            token: null,
            paths: fallback,
            pathContextRef: ref,
          });
          const res = await app.inject({ method: "GET", url: "/participants" });
          expect(res.statusCode).toBe(200);
          expect(res.json().participants).toEqual({});
          await app.close();
        } finally {
          rmSync(fresh, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("reads participants from the active path, not the fallback", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-pt-other-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-pt-cfg-"));
        try {
          const fallback = paths(fallbackRoot);
          await initProject(fallback);
          const other = paths(otherRoot);
          await initProject(other);

          const g = globalPaths(configRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(otherRoot),
          });
          const { app } = createServer({
            token: null,
            paths: fallback,
            pathContextRef: ref,
          });

          // Register an agent in the active path.
          await app.inject({
            method: "POST",
            url: "/participants/register",
            payload: { kind: "agent", name: "OtherAgent" },
          });

          // GET should show the active-path roster (1 user + 1 agent).
          const res = await app.inject({ method: "GET", url: "/participants" });
          const list = res.json().participants as Record<string, { name: string }>;
          expect(Object.values(list).some((p) => p.name === "OtherAgent")).toBe(true);

          // Switch ref away — should now see only fallback's default user.
          ref.setActive(null);
          const res2 = await app.inject({ method: "GET", url: "/participants" });
          const list2 = res2.json().participants as Record<string, { name: string }>;
          expect(Object.values(list2).some((p) => p.name === "OtherAgent")).toBe(false);

          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });
  });
});

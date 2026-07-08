/* Root-scoped event-POST boundary (expansion-decisions.md X2).

   The legacy STALE_PATH guard + `path` body alias are DELETED. Event writes
   now carry a REQUIRED root scope (path_id | root) resolved through the
   known-root set:
     - missing scope          → 400 ROOT_SCOPE_REQUIRED
     - unknown scope          → 404 UNKNOWN_ROOT
     - a KNOWN background root → accepted (no longer a stale-path 409)

   The --quiet-cross-path-hooks CLI flag still parses (its plumbing is
   retained) but no longer changes event-write behavior. */

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { registerProjectPath } from "../../src/paths/registry.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("required root scope on event POSTs (X2)", () => {
  it("400 ROOT_SCOPE_REQUIRED when no path_id/root is provided", async () => {
    await withTempProject(async (active) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-sp-cfg-"));
      try {
        const p = paths(active);
        await initProject(p);
        const g = globalPaths(cfg);
        const ref = new PathContextRef({ global: g, active: activePaths(active) });
        const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

        const create = await app.inject({
          method: "POST",
          url: "/sessions",
          payload: { slug: "s1" },
        });
        const session = create.json();
        const pl = await app.inject({ method: "GET", url: "/participants" });
        const userId = Object.entries(
          pl.json().participants as Record<string, { kind: string }>,
        ).find(([, v]) => v.kind === "user")![0];

        const res = await app.inject({
          method: "POST",
          url: `/sessions/${session.id}/events/prose`,
          payload: { participant_id: userId, content: "no scope" },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe("ROOT_SCOPE_REQUIRED");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("404 UNKNOWN_ROOT when the root is not a known root", async () => {
    await withTempProject(async (active) => {
      const other = mkdtempSync(join(tmpdir(), "fmark-sp-unknown-"));
      const cfg = mkdtempSync(join(tmpdir(), "fmark-sp-cfg2-"));
      try {
        const p = paths(active);
        await initProject(p);
        const g = globalPaths(cfg);
        const ref = new PathContextRef({ global: g, active: activePaths(active) });
        const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

        const create = await app.inject({
          method: "POST",
          url: "/sessions",
          payload: { slug: "s1" },
        });
        const session = create.json();
        const pl = await app.inject({ method: "GET", url: "/participants" });
        const userId = Object.entries(
          pl.json().participants as Record<string, { kind: string }>,
        ).find(([, v]) => v.kind === "user")![0];

        const res = await app.inject({
          method: "POST",
          url: `/sessions/${session.id}/events/prose`,
          payload: { participant_id: userId, content: "x", root: other },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().code).toBe("UNKNOWN_ROOT");
        await app.close();
      } finally {
        rmSync(other, { recursive: true, force: true });
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("accepts a write to a KNOWN background root (no STALE_PATH 409)", async () => {
    await withTempProject(async (active) => {
      await withTempProject(async (background) => {
        const cfg = mkdtempSync(join(tmpdir(), "fmark-sp-cfg3-"));
        try {
          // Background root is a fully initialized project with a session.
          const bg = paths(background);
          await initProject(bg);
          const bgSession = await createSession(bg, { slug: "bg" });
          const [bgPid] = Object.keys(await listParticipants(bg));

          const p = paths(active);
          await initProject(p);
          const g = globalPaths(cfg);
          // Register the background root so it is a KNOWN root.
          await registerProjectPath(g, background);
          const ref = new PathContextRef({ global: g, active: activePaths(active) });
          const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

          const res = await app.inject({
            method: "POST",
            url: `/sessions/${bgSession.id}/events/prose`,
            payload: {
              participant_id: bgPid!,
              content: "from a known background root",
              root: background,
            },
          });
          expect(res.statusCode).toBe(200);
          expect(res.json().filename).toMatch(/\.prose\.md$/);
          await app.close();
        } finally {
          rmSync(cfg, { recursive: true, force: true });
        }
      });
    });
  });

  it("accepts a write scoped to the active root", async () => {
    await withTempProject(async (active) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-sp-cfg4-"));
      try {
        const p = paths(active);
        await initProject(p);
        const g = globalPaths(cfg);
        const ref = new PathContextRef({ global: g, active: activePaths(active) });
        const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

        const create = await app.inject({
          method: "POST",
          url: "/sessions",
          payload: { slug: "s1" },
        });
        const session = create.json();
        const pl = await app.inject({ method: "GET", url: "/participants" });
        const userId = Object.entries(
          pl.json().participants as Record<string, { kind: string }>,
        ).find(([, v]) => v.kind === "user")![0];

        const res = await app.inject({
          method: "POST",
          url: `/sessions/${session.id}/events/prose`,
          payload: {
            participant_id: userId,
            content: "from the active root",
            root: active,
          },
        });
        expect(res.statusCode).toBe(200);
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });
});

describe("--quiet-cross-path-hooks CLI flag", () => {
  it("is parsed off by default", async () => {
    const { parseArgs } = await import("../../src/cli.js");
    expect(parseArgs([]).quietCrossPathHooks).toBe(false);
  });
  it("is on with --quiet-cross-path-hooks", async () => {
    const { parseArgs } = await import("../../src/cli.js");
    expect(parseArgs(["--quiet-cross-path-hooks"]).quietCrossPathHooks).toBe(true);
  });
});

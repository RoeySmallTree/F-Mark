/* STALE_PATH check at the event-POST boundary.
   When a hook posts with a body.path that doesn't match the kernel's
   active path, the route returns 409 STALE_PATH. With --quiet-cross-path-hooks
   the kernel accepts the post regardless. */

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("STALE_PATH on event POSTs", () => {
  it("returns 409 STALE_PATH when body.path differs from active", async () => {
    await withTempProject(async (active) => {
      const other = mkdtempSync(join(tmpdir(), "fmark-sp-other-"));
      const cfg = mkdtempSync(join(tmpdir(), "fmark-sp-cfg-"));
      try {
        const p = paths(active);
        await initProject(p);
        const g = globalPaths(cfg);
        const ref = new PathContextRef({ global: g, active: activePaths(active) });
        const { app } = createServer({
          token: null,
          paths: p,
          pathContextRef: ref,
        });

        // First make sure a session exists in the active path.
        const create = await app.inject({
          method: "POST",
          url: "/sessions",
          payload: { slug: "s1" },
        });
        const session = create.json();

        // Resolve a participant.
        const pl = await app.inject({ method: "GET", url: "/participants" });
        const userId = Object.entries(pl.json().participants as Record<string, { kind: string }>)
          .find(([, v]) => v.kind === "user")![0];

        // Post a prose event with body.path pointing at the OTHER folder.
        // The kernel should 409 because the path doesn't match active.
        const res = await app.inject({
          method: "POST",
          url: `/sessions/${session.id}/events/prose`,
          payload: {
            participant_id: userId,
            content: "from a stale path",
            path: other,
          },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().code).toBe("STALE_PATH");
        await app.close();
      } finally {
        rmSync(other, { recursive: true, force: true });
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("accepts the post when quietCrossPathHooks is set", async () => {
    await withTempProject(async (active) => {
      const other = mkdtempSync(join(tmpdir(), "fmark-sp-other2-"));
      const cfg = mkdtempSync(join(tmpdir(), "fmark-sp-cfg2-"));
      try {
        const p = paths(active);
        await initProject(p);
        const g = globalPaths(cfg);
        const ref = new PathContextRef({ global: g, active: activePaths(active) });
        const { app } = createServer({
          token: null,
          paths: p,
          pathContextRef: ref,
          quietCrossPathHooks: true,
        });
        const create = await app.inject({
          method: "POST",
          url: "/sessions",
          payload: { slug: "s1" },
        });
        const session = create.json();
        const pl = await app.inject({ method: "GET", url: "/participants" });
        const userId = Object.entries(pl.json().participants as Record<string, { kind: string }>)
          .find(([, v]) => v.kind === "user")![0];

        const res = await app.inject({
          method: "POST",
          url: `/sessions/${session.id}/events/prose`,
          payload: {
            participant_id: userId,
            content: "from a stale path (quietly)",
            path: other,
          },
        });
        expect(res.statusCode).toBe(200);
        await app.close();
      } finally {
        rmSync(other, { recursive: true, force: true });
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("ignores body.path when it matches active path", async () => {
    await withTempProject(async (active) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-sp-cfg3-"));
      try {
        const p = paths(active);
        await initProject(p);
        const g = globalPaths(cfg);
        const ref = new PathContextRef({ global: g, active: activePaths(active) });
        const { app } = createServer({
          token: null,
          paths: p,
          pathContextRef: ref,
        });
        const create = await app.inject({
          method: "POST",
          url: "/sessions",
          payload: { slug: "s1" },
        });
        const session = create.json();
        const pl = await app.inject({ method: "GET", url: "/participants" });
        const userId = Object.entries(pl.json().participants as Record<string, { kind: string }>)
          .find(([, v]) => v.kind === "user")![0];

        const res = await app.inject({
          method: "POST",
          url: `/sessions/${session.id}/events/prose`,
          payload: {
            participant_id: userId,
            content: "from the right place",
            path: active,
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

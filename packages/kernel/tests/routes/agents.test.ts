import { describe, it, expect } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { readActiveSession } from "../../src/agents/activeSession.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id };
}

describe("POST /agents/:id/link", () => {
  it("writes the active-session pointer and returns session metadata", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: "/agents/ag-claude/link",
        payload: { session_id: sessionId },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        participant_id: "ag-claude",
        session_id: sessionId,
      });
      const { join: joinPath } = await import("node:path");
      expect(await readActiveSession(joinPath(p.fmarkDir(), "agents"), "ag-claude")).toBe(
        sessionId,
      );
      await app.close();
    });
  });

  it("400s without an explicit root scope when a path context is set", async () => {
    await withTempProject(async (fallbackRoot) => {
      await withTempProject(async (activeRoot) => {
        await withTempProject(async (configRoot) => {
          const fallback = paths(fallbackRoot);
          const active = paths(activeRoot);
          await initProject(fallback);
          await initProject(active);
          const session = await createSession(active, { slug: "active" });
          const activePath = activePaths(activeRoot);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePath,
          });
          const { app } = createServer({
            token: null,
            paths: fallback,
            pathContextRef: ref,
          });

          const res = await app.inject({
            method: "POST",
            url: "/agents/ag-claude/link",
            payload: { session_id: session.id },
          });

          expect(res.statusCode).toBe(400);
          expect(res.json()).toMatchObject({ code: "ROOT_SCOPE_REQUIRED" });
          expect(
            await readActiveSession(
              g.projectAgentsDir(activePath.pathId()),
              "ag-claude",
            ),
          ).toBeNull();
          await app.close();
        });
      });
    });
  });

  it("writes active-session through the global store when a path_id is provided", async () => {
    await withTempProject(async (fallbackRoot) => {
      await withTempProject(async (activeRoot) => {
        await withTempProject(async (configRoot) => {
          const fallback = paths(fallbackRoot);
          const active = paths(activeRoot);
          await initProject(fallback);
          await initProject(active);
          const session = await createSession(active, { slug: "active" });
          const activePath = activePaths(activeRoot);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePath,
          });
          const { app } = createServer({
            token: null,
            paths: fallback,
            pathContextRef: ref,
          });

          const res = await app.inject({
            method: "POST",
            url: "/agents/ag-claude/link",
            payload: { session_id: session.id, path_id: activePath.pathId() },
          });

          expect(res.statusCode).toBe(200);
          expect(
            await readActiveSession(
              g.projectAgentsDir(activePath.pathId()),
              "ag-claude",
            ),
          ).toBe(session.id);
          expect(
            await readActiveSession(
              `${active.fmarkDir()}/agents`,
              "ag-claude",
            ),
          ).toBe(session.id);
          await app.close();
        });
      });
    });
  });

  it("404s on unknown session", async () => {
    await withTempProject(async (root) => {
      const { app } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: "/agents/ag-claude/link",
        payload: { session_id: "definitely-not-real" },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("400s on invalid participant_id (path traversal)", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: "/agents/..%2Fetc/link",
        payload: { session_id: sessionId },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("401s without bearer (when kernel started with token)", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const { app } = createServer({ token: "secret", paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/agents/ag-claude/link",
        payload: { session_id: session.id },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });
});

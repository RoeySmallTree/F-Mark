import { describe, it, expect } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { readActiveSession } from "../../src/agents/activeSession.js";
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
      expect(await readActiveSession(p.fmarkDir(), "ag-claude")).toBe(
        sessionId,
      );
      await app.close();
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

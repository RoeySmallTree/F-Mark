import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id, pid: pid! };
}

const validPayload = {
  id: "fl_1",
  title: "Pipeline",
  nodes: [
    { id: "n1", label: "Input", itemType: "info", position: { x: 0, y: 0 } },
    { id: "n2", label: "Process", itemType: "default", position: { x: 200, y: 0 } },
    {
      id: "n3",
      label: "Done",
      itemType: "success",
      focused: true,
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2", style: "solid", type: "default" },
    { id: "e2", source: "n2", target: "n3", style: "flowing", type: "success" },
  ],
};

describe("POST /sessions/:id/events/flow", () => {
  it("writes a .flow.json file with the payload", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: { root, participant_id: pid, ...validPayload  },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.flow\.json$/);
      expect(body.kind).toBe("flow");

      const file = await readFile(
        join(p.sessionDir(sessionId), body.filename),
        "utf8",
      );
      const parsed = JSON.parse(file);
      expect(parsed.id).toBe("fl_1");
      expect(parsed.nodes).toHaveLength(3);
      expect(parsed.edges).toHaveLength(2);
      await app.close();
    });
  });

  it("returns 400 if a node lacks an id", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: {
          root,
          participant_id: pid,
          id: "fl_2",
          nodes: [{ label: "no id" }],
          edges: [],
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("returns 400 if an edge references a missing node", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: {
          root,
          participant_id: pid,
          id: "fl_3",
          nodes: [{ id: "n1", label: "A" }],
          edges: [{ id: "e1", source: "n1", target: "n-missing" }],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/edge.*references.*n-missing/i);
      await app.close();
    });
  });

  it("returns 400 if node ids are not unique", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: {
          root,
          participant_id: pid,
          id: "fl_4",
          nodes: [
            { id: "n1", label: "A" },
            { id: "n1", label: "B" },
          ],
          edges: [],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/duplicate.*node.*id/i);
      await app.close();
    });
  });

  it("returns 404 on missing session", async () => {
    await withTempProject(async (root) => {
      const { app, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/no-such/events/flow`,
        payload: { root, participant_id: pid, ...validPayload  },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("accepts supersedes on a follow-up flow with the same id", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const first = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: { root, participant_id: pid, ...validPayload  },
      });
      const firstFilename = first.json().filename as string;

      const second = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/flow`,
        payload: {
          root,
          participant_id: pid,
          ...validPayload,
          supersedes: firstFilename,
        },
      });
      expect(second.statusCode).toBe(200);
      const body = second.json();
      expect(body.filename).not.toBe(firstFilename);
      // The new file exists on disk under the session folder.
      const file = await readFile(
        join(p.sessionDir(sessionId), body.filename as string),
        "utf8",
      );
      expect(JSON.parse(file).supersedes).toBe(firstFilename);
      await app.close();
    });
  });
});

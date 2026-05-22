import { describe, it, expect } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { registerAgent } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id, pid: pid! };
}

describe("POST /sessions/:id/events/todo", () => {
  it("creates a todo event", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: {
          participant_id: pid,
          id: "td_1",
          title: "Draft launch email",
          status: "open",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.todo\.json$/);
      expect(body.kind).toBe("todo");
      await app.close();
    });
  });

  it("rejects bad status enum", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: {
          participant_id: pid,
          id: "td_1",
          title: "x",
          status: "wat",
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("rejects empty title", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: {
          participant_id: pid,
          id: "td_1",
          title: "",
          status: "open",
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("rejects missing session", async () => {
    await withTempProject(async (root) => {
      const { app, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/no-such/events/todo`,
        payload: {
          participant_id: pid,
          id: "td_1",
          title: "x",
          status: "open",
        },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});

describe("GET /sessions/:id/todos", () => {
  it("groups by status, returns latest per id", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      // create two todos
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: { participant_id: pid, id: "a", title: "A", status: "open" },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: { participant_id: pid, id: "b", title: "B", status: "wip" },
      });
      // update todo a -> done via supersedes
      const list1 = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/events?kinds=todo`,
      });
      const events1 = list1.json().events as { filename: string; payload: { id: string } }[];
      const aFilename = events1.find((e) => e.payload.id === "a")!.filename;
      const supRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: {
          participant_id: pid,
          id: "a",
          title: "A",
          status: "done",
          supersedes: aFilename,
        },
      });
      expect(supRes.statusCode).toBe(200);

      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/todos`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.open).toEqual([]);
      expect(body.wip).toHaveLength(1);
      expect(body.wip[0].id).toBe("b");
      expect(body.done).toHaveLength(1);
      expect(body.done[0].id).toBe("a");
      await app.close();
    });
  });

  it("filters by assigned_to", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const agent = await registerAgent(p, { name: "AgentX" });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: {
          participant_id: pid,
          id: "a",
          title: "A",
          status: "open",
          assigned_to: pid,
        },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: {
          participant_id: pid,
          id: "b",
          title: "B",
          status: "open",
          assigned_to: agent.id,
        },
      });
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/todos?assigned_to=${pid}`,
      });
      const body = res.json();
      expect(body.open).toHaveLength(1);
      expect(body.open[0].id).toBe("a");
      await app.close();
    });
  });

  it("returns latest version per id and sorts newest-first", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: { participant_id: pid, id: "a", title: "Old", status: "open" },
      });
      // Newer version with same id (no supersedes); aggregator picks the
      // newest by timestamp.
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: { participant_id: pid, id: "a", title: "New", status: "open" },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: { participant_id: pid, id: "c", title: "C", status: "open" },
      });
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/todos`,
      });
      const body = res.json();
      expect(body.open).toHaveLength(2);
      // Newest first
      expect(body.open[0].id).toBe("c");
      // The "a" entry that survives must have title "New"
      const aEntry = body.open.find(
        (t: { id: string; title: string }) => t.id === "a",
      );
      expect(aEntry.title).toBe("New");
      await app.close();
    });
  });

  it("returns 404 on missing session", async () => {
    await withTempProject(async (root) => {
      const { app } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/sessions/missing/todos`,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});

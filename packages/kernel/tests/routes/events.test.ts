import { describe, it, expect } from "vitest";
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

describe("POST /sessions/:id/events/prose", () => {
  it("writes a prose event with no frontmatter", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { participant_id: pid, content: "hello" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.prose\.md$/);
      expect(body.kind).toBe("prose");
      await app.close();
    });
  });

  it("writes a named prose with frontmatter", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { participant_id: pid, content: "body", name: "Launch" },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  it("rejects missing participant_id", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { content: "hello" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("rejects unknown session", async () => {
    await withTempProject(async (root) => {
      const { app, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: "/sessions/no-such/events/prose",
        payload: { participant_id: pid, content: "hi" },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});

describe("POST /sessions/:id/events/choices", () => {
  it("writes a choices event", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/choices`,
        payload: {
          participant_id: pid,
          id: "ch_1",
          question: "Pick?",
          options: [{ id: "a", label: "A" }],
          multi: false,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.choices\.json$/);
      await app.close();
    });
  });
});

describe("POST /sessions/:id/events/choice", () => {
  it("writes a choice answer", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/choice`,
        payload: {
          participant_id: pid,
          choices_id: "ch_1",
          selected: ["a"],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().filename).toMatch(/\.choice\.json$/);
      await app.close();
    });
  });
});

describe("POST /sessions/:id/events/turn-end", () => {
  it("writes a turn-end marker", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/turn-end`,
        payload: { participant_id: pid },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().filename).toMatch(/\.turn-end\.json$/);
      await app.close();
    });
  });
});

describe("GET /sessions/:id/events", () => {
  it("returns events written via POST routes, sorted by ts", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { participant_id: pid, content: "hi" },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/turn-end`,
        payload: { participant_id: pid },
      });
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/events`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.events).toHaveLength(2);
      expect(body.events[0].kind).toBe("prose");
      expect(body.events[1].kind).toBe("turn-end");
      await app.close();
    });
  });

  it("respects kinds filter", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { participant_id: pid, content: "hi" },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/turn-end`,
        payload: { participant_id: pid },
      });
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/events?kinds=turn-end`,
      });
      expect(res.json().events).toHaveLength(1);
      await app.close();
    });
  });
});

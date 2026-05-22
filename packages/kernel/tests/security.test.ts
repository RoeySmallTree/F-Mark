import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import { createSession } from "../src/sessions.js";
import { listParticipants } from "../src/participants.js";
import { withTempProject } from "./helpers/tempdir.js";

describe("security", () => {
  it("rejects session id with .. in events POST", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const [pid] = Object.keys(await listParticipants(p));
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/sessions/..%2Fescape/events/prose",
        payload: { participant_id: pid, content: "x" },
      });
      expect([400, 404]).toContain(res.statusCode);
      await app.close();
    });
  });

  it("rejects participant ids that don't match pattern", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: { participant_id: "../etc/passwd", content: "x" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("only serves /health without auth when token is set", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      const sessions = await app.inject({ method: "GET", url: "/sessions" });
      expect(sessions.statusCode).toBe(401);
      await app.close();
    });
  });

  it("supersedes pointing outside the session is accepted on POST (stored as field, not a path op)", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const [pid] = Object.keys(await listParticipants(p));
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: {
          participant_id: pid,
          content: "x",
          supersedes: "../../etc/passwd",
        },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });
});

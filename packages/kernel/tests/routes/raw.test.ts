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

describe("GET /sessions/:id/raw/:filename", () => {
  it("serves index.html inside an html bundle folder", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const create = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: {
          participant_id: pid,
          html: "<h1>Hello raw</h1>",
          css: "h1 { color: blue; }",
        },
      });
      const folder = create.json().filename;

      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${folder}/index.html`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/html/);
      expect(res.body).toBe("<h1>Hello raw</h1>");

      const cssRes = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${folder}/style.css`,
      });
      expect(cssRes.statusCode).toBe(200);
      expect(cssRes.headers["content-type"]).toMatch(/css/);
      expect(cssRes.body).toBe("h1 { color: blue; }");
      await app.close();
    });
  });

  it("rejects path traversal in :filename", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/..%2F..%2F..%2Fetc%2Fpasswd`,
      });
      expect(res.statusCode === 400 || res.statusCode === 404).toBe(true);
      await app.close();
    });
  });

  it("rejects path traversal inside the wildcard segment", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const create = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: { participant_id: pid, html: "<p>ok</p>" },
      });
      const folder = create.json().filename;
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${folder}/..%2F..%2F..%2Fetc%2Fpasswd`,
      });
      expect(res.statusCode === 400 || res.statusCode === 404).toBe(true);
      await app.close();
    });
  });

  it("returns 404 for unknown files", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/nope.txt`,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("returns 404 on unknown session", async () => {
    await withTempProject(async (root) => {
      const { app } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/sessions/no-such/raw/anything.html`,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});

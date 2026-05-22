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

describe("POST /sessions/:id/events/file", () => {
  it("writes a file event referencing the asset", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/file`,
        payload: {
          participant_id: pid,
          id: "f1",
          path: "assets/diagram.png",
          mime_type: "image/png",
          description: "diagram",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.file\.json$/);
      expect(body.kind).toBe("file");
      const fileOnDisk = await readFile(
        join(p.sessionDir(sessionId), body.filename),
        "utf8",
      );
      const payload = JSON.parse(fileOnDisk);
      expect(payload.id).toBe("f1");
      expect(payload.mime_type).toBe("image/png");
      expect(payload.description).toBe("diagram");
      await app.close();
    });
  });

  it("returns 400 on missing required fields", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/file`,
        payload: {
          participant_id: pid,
          id: "f1",
          // missing path and mime_type
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("returns 404 on unknown session", async () => {
    await withTempProject(async (root) => {
      const { app, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/no-such/events/file`,
        payload: {
          participant_id: pid,
          id: "f1",
          path: "assets/x.png",
          mime_type: "image/png",
        },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});

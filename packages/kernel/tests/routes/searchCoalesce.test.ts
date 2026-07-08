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

async function postProse(
  app: Awaited<ReturnType<typeof setup>>["app"],
  sessionId: string,
  root: string,
  pid: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/events/prose`,
    payload: { root, participant_id: pid, ...body },
  });
  expect(res.statusCode).toBe(200);
  return res.json().filename as string;
}

describe("search hides superseded prose fragments", () => {
  it("returns only the coalesced message, not its streamed delta fragments", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      // Two streamed deltas that split the word "hello world".
      const d1 = await postProse(app, sessionId, root, pid, {
        content: "hello ",
        arbitrary: true,
      });
      const d2 = await postProse(app, sessionId, root, pid, {
        content: "world",
        arbitrary: true,
      });
      // Coalesced canonical message supersedes both fragments.
      await postProse(app, sessionId, root, pid, {
        content: "hello world",
        supersedes: [d1, d2],
      });

      const res = await app.inject({ method: "GET", url: `/search?q=hello` });
      expect(res.statusCode).toBe(200);
      const hits = res.json().hits as Array<{ event: { filename: string } }>;
      // Fragment d1 ("hello ") matches "hello" but must be hidden; only the
      // coalesced event remains.
      const filenames = hits.map((h) => h.event.filename);
      expect(filenames).not.toContain(d1);
      expect(filenames.filter((f) => f.endsWith(".prose.md"))).toHaveLength(1);
      await app.close();
    });
  });
});

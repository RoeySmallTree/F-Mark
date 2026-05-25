import { describe, it, expect } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { writeEventFile } from "../../src/events/writer.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { registerProjectPath } from "../../src/paths/registry.js";
import { withTempProject } from "../helpers/tempdir.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id, pid: pid! };
}

describe("GET /search", () => {
  it("finds prose content match", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          participant_id: pid,
          content: "We should discuss launch logistics today.",
        },
      });
      const res = await app.inject({
        method: "GET",
        url: `/search?q=launch`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.hits.length).toBeGreaterThan(0);
      expect(body.hits[0].snippet).toMatch(/launch/i);
      await app.close();
    });
  });

  it("finds matches in prose frontmatter name", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          participant_id: pid,
          name: "Launch Plan v1",
          content: "Plan body content here.",
        },
      });
      const res = await app.inject({
        method: "GET",
        url: `/search?q=Launch%20Plan`,
      });
      const body = res.json();
      expect(body.hits.length).toBeGreaterThan(0);
      expect(body.hits[0].snippet).toMatch(/Launch Plan/i);
      await app.close();
    });
  });

  it("finds choices question match", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/choices`,
        payload: {
          participant_id: pid,
          id: "ch_1",
          question: "Which approach for the rewrite?",
          options: [
            { id: "a", label: "Incremental" },
            { id: "b", label: "Big bang" },
          ],
          multi: false,
        },
      });
      const res = await app.inject({
        method: "GET",
        url: `/search?q=approach`,
      });
      const body = res.json();
      expect(body.hits.length).toBeGreaterThan(0);
      expect(body.hits[0].event.kind).toBe("choices");
      await app.close();
    });
  });

  it("finds todo title match", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/todo`,
        payload: {
          participant_id: pid,
          id: "td_1",
          title: "Draft the announcement email",
          status: "open",
        },
      });
      const res = await app.inject({
        method: "GET",
        url: `/search?q=announcement`,
      });
      const body = res.json();
      expect(body.hits.length).toBeGreaterThan(0);
      expect(body.hits[0].event.kind).toBe("todo");
      expect(body.hits[0].snippet).toMatch(/announcement/i);
      await app.close();
    });
  });

  it("returns snippet with context around the match", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const long =
        "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega target the rest of this sentence is filler material for context window testing.";
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { participant_id: pid, content: long },
      });
      const res = await app.inject({
        method: "GET",
        url: `/search?q=target`,
      });
      const body = res.json();
      expect(body.hits.length).toBeGreaterThan(0);
      expect(body.hits[0].snippet).toMatch(/target/);
      expect(body.hits[0].snippet.length).toBeLessThanOrEqual(180);
      await app.close();
    });
  });

  it("respects session filter", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const sessB = await createSession(p, { slug: "y" });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { participant_id: pid, content: "needle in A" },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessB.id}/events/prose`,
        payload: { participant_id: pid, content: "needle in B" },
      });
      const resAll = await app.inject({
        method: "GET",
        url: `/search?q=needle`,
      });
      expect(resAll.json().hits.length).toBe(2);

      const resA = await app.inject({
        method: "GET",
        url: `/search?q=needle&session=${sessionId}`,
      });
      const onlyA = resA.json().hits;
      expect(onlyA.length).toBe(1);
      expect(onlyA[0].session_id).toBe(sessionId);
      await app.close();
    });
  });

  it("respects limit", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: "POST",
          url: `/sessions/${sessionId}/events/prose`,
          payload: { participant_id: pid, content: `match_${i} the keyword` },
        });
      }
      const res = await app.inject({
        method: "GET",
        url: `/search?q=keyword&limit=2`,
      });
      expect(res.json().hits.length).toBe(2);
      await app.close();
    });
  });

  it("sorts hits newest-first", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { participant_id: pid, content: "alpha keyword" },
      });
      // sleep briefly to ensure different timestamp
      await new Promise((r) => setTimeout(r, 1100));
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { participant_id: pid, content: "beta keyword" },
      });
      const res = await app.inject({
        method: "GET",
        url: `/search?q=keyword`,
      });
      const hits = res.json().hits;
      expect(hits[0].event.payload.content).toMatch(/beta/);
      expect(hits[1].event.payload.content).toMatch(/alpha/);
      await app.close();
    });
  });

  it("returns 404 when session filter is invalid", async () => {
    await withTempProject(async (root) => {
      const { app } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/search?q=x&session=missing`,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("scope=all searches registered paths and returns path/session tags", async () => {
    await withTempProject(async (root) => {
      const otherRoot = mkdtempSync(join(tmpdir(), "fmark-search-"));
      const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
      try {
        const p = paths(root);
        await initProject(p);
        const otherPaths = paths(otherRoot);
        await initProject(otherPaths);
        const other = await createSession(otherPaths, { slug: "other" });
        const [otherParticipant] = Object.keys(await listParticipants(otherPaths));
        await writeEventFile(otherPaths, other.id, {
          participant_id: otherParticipant!,
          kind: "file",
          ext: "json",
          contents: JSON.stringify({
            id: "file-1",
            path: "/tmp/launch-brief.pdf",
            mime_type: "application/pdf",
            display_name: "Launch Brief",
          }),
        });

        const g = globalPaths(configRoot);
        await registerProjectPath(g, otherRoot);
        const ref = new PathContextRef({ global: g, active: activePaths(root) });
        const { app } = createServer({
          token: null,
          paths: p,
          pathContextRef: ref,
        });

        const res = await app.inject({
          method: "GET",
          url: "/search?q=brief&scope=all",
        });
        expect(res.statusCode).toBe(200);
        const hit = res.json().hits[0];
        expect(hit.path).toBe(otherRoot);
        expect(hit.session_slug).toBe("other");
        expect(hit.event.kind).toBe("file");
        await app.close();
      } finally {
        rmSync(otherRoot, { recursive: true, force: true });
        rmSync(configRoot, { recursive: true, force: true });
      }
    });
  });
});

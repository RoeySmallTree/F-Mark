import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { registerProjectPath } from "../../src/paths/registry.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  const { app } = createServer({ token: null, paths: p });
  /* X2: every event POST now carries a required root scope. With no
     multi-path ref wired, the fallback root is the only known root, so
     `root` resolves to it. Tests pass `root` in each payload. */
  return { p, app, sessionId: session.id, pid: pid!, root };
}

describe("POST /sessions/:id/events/prose", () => {
  it("writes a prose event with no frontmatter", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { root, participant_id: pid, content: "hello" },
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
        payload: { root, participant_id: pid, content: "body", name: "Launch" },
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
        payload: { root, participant_id: pid, content: "hi" },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});

describe("POST /sessions/:id/events/prose — file comments", () => {
  it("writes a file comment (file_path + lines + diff_base) to disk", async () => {
    await withTempProject(async (root) => {
      const { app, p, sessionId, pid } = await setup(root);

      const commentRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "a comment",
          file_path: "src/app.ts",
          lines: [2, 4],
          diff_base: "current-session",
        },
      });
      expect(commentRes.statusCode).toBe(200);
      const commentFilename = commentRes.json().filename;
      const onDisk = await readFile(
        join(p.sessionDir(sessionId), commentFilename),
        "utf8",
      );
      expect(onDisk).toContain("file_path: src/app.ts");
      expect(onDisk).toContain("lines:");
      expect(onDisk).toContain("diff_base: current-session");
      expect(onDisk).not.toMatch(/^append_to:/m);
      await app.close();
    });
  });

  it("writes a whole-file comment (file_path, no lines)", async () => {
    await withTempProject(async (root) => {
      const { app, p, sessionId, pid } = await setup(root);

      const commentRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "whole-file note",
          file_path: "src/app.ts",
        },
      });
      expect(commentRes.statusCode).toBe(200);
      const onDisk = await readFile(
        join(p.sessionDir(sessionId), commentRes.json().filename),
        "utf8",
      );
      expect(onDisk).toContain("file_path: src/app.ts");
      expect(onDisk).not.toMatch(/^lines:/m);
      await app.close();
    });
  });

  it("400s when body has BOTH file_path and append_to", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const anchorRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { root, participant_id: pid, content: "body", name: "Doc" },
      });
      const anchorFilename = anchorRes.json().filename;
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "x",
          file_path: "src/app.ts",
          append_to: anchorFilename,
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("accepts new-shape body directly and writes new-shape file", async () => {
    await withTempProject(async (root) => {
      const { app, p, sessionId, pid } = await setup(root);
      const anchorRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { root, participant_id: pid, content: "body", name: "Doc" },
      });
      const anchorFilename = anchorRes.json().filename;

      const commentRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "block body",
          append_to: anchorFilename,
        },
      });
      expect(commentRes.statusCode).toBe(200);
      const onDisk = await readFile(
        join(p.sessionDir(sessionId), commentRes.json().filename),
        "utf8",
      );
      expect(onDisk).toContain(`append_to: ${anchorFilename}`);
      expect(onDisk).not.toMatch(/^target:/m);
      await app.close();
    });
  });

  it("400s when `lines` is set without `mode: comment`", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const anchorRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { root, participant_id: pid, content: "body", name: "Doc" },
      });
      const anchorFilename = anchorRes.json().filename;
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "x",
          append_to: anchorFilename,
          lines: [1, 2],
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("400s when comment carries `name`", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const anchorRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { root, participant_id: pid, content: "body", name: "Doc" },
      });
      const anchorFilename = anchorRes.json().filename;
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "x",
          append_to: anchorFilename,
          mode: "comment",
          name: "Should not be here",
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("strips unknown properties (additionalProperties: false + Fastify default removeAdditional)", async () => {
    /* Fastify's default Ajv config has `removeAdditional: true`. Combined
       with `additionalProperties: false` on the schema, unknown keys are
       silently dropped before they reach the handler — so they never
       make it onto disk. Phase 3 will tighten this to a hard 400 across
       every route once we reconfigure Ajv; for Phase 2 we just verify
       the stray didn't persist. */
    await withTempProject(async (root) => {
      const { app, p, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "hi",
          mood: "happy",
        },
      });
      expect(res.statusCode).toBe(200);
      const onDisk = await readFile(
        join(p.sessionDir(sessionId), res.json().filename),
        "utf8",
      );
      expect(onDisk).not.toContain("mood");
      await app.close();
    });
  });
});

describe("POST /sessions/:id/events/prose with arbitrary", () => {
  it("stores arbitrary: true in frontmatter when sent", async () => {
    await withTempProject(async (root) => {
      const { app, p, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "mid-turn output",
          arbitrary: true,
        },
      });
      expect(res.statusCode).toBe(200);
      const filename = res.json().filename;
      const onDisk = await readFile(
        join(p.sessionDir(sessionId), filename),
        "utf8",
      );
      expect(onDisk).toMatch(/arbitrary: true/);
      expect(onDisk).toContain("mid-turn output");
      await app.close();
    });
  });

  it("does not write arbitrary key when false/omitted", async () => {
    await withTempProject(async (root) => {
      const { app, p, sessionId, pid } = await setup(root);

      const resFalse = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "explicit false",
          arbitrary: false,
        },
      });
      expect(resFalse.statusCode).toBe(200);
      const onDiskFalse = await readFile(
        join(p.sessionDir(sessionId), resFalse.json().filename),
        "utf8",
      );
      expect(onDiskFalse).not.toMatch(/arbitrary/);

      const resOmitted = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { root, participant_id: pid, content: "omitted" },
      });
      expect(resOmitted.statusCode).toBe(200);
      const onDiskOmitted = await readFile(
        join(p.sessionDir(sessionId), resOmitted.json().filename),
        "utf8",
      );
      expect(onDiskOmitted).not.toMatch(/arbitrary/);

      await app.close();
    });
  });

  it("400s on non-boolean arbitrary value", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/prose`,
        payload: { root, participant_id: pid, content: "hi", arbitrary: 1 },
      });
      expect(res.statusCode).toBe(400);
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
          root,
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

  it("rejects a multi-select question sent with multi false", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/choices`,
        payload: {
          root,
          participant_id: pid,
          id: "ch_mix",
          question: "Which ideas should we combine?",
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          multi: false,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("multi is false");
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
          root,
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
        payload: { root, participant_id: pid },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().filename).toMatch(/\.turn-end\.json$/);
      await app.close();
    });
  });
});

describe("POST /sessions/:id/events/tool-use", () => {
  it("writes a tool-use event file and broadcasts", async () => {
    await withTempProject(async (root) => {
      const { app, p, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/tool-use`,
        payload: {
          root,
          participant_id: pid,
          tool_name: "Bash",
          tool_use_id: "tu_01",
          input: { command: "ls" },
          result: "a\nb\n",
          success: true,
          duration_ms: 12,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(
        new RegExp(`\\d{8}T\\d{6}\\.\\d{3}Z_${pid}\\.tool-use\\.json$`),
      );
      expect(body.kind).toBe("tool-use");

      const onDisk = await readFile(
        join(p.sessionDir(sessionId), body.filename),
        "utf8",
      );
      expect(JSON.parse(onDisk)).toMatchObject({
        tool_name: "Bash",
        success: true,
      });
      await app.close();
    });
  });

  it("400s on missing tool_name", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/tool-use`,
        payload: {
          root,
          participant_id: pid,
          tool_use_id: "tu_01",
          input: {},
          success: true,
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("401s without bearer when token is configured", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const [pid] = Object.keys(await listParticipants(p));
      const { app } = createServer({ token: "secret", paths: p });
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/tool-use`,
        payload: {
          root,
          participant_id: pid!,
          tool_name: "x",
          tool_use_id: "y",
          input: {},
          success: true,
        },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  it("preserves success: false and structured (non-string) result on disk", async () => {
    await withTempProject(async (root) => {
      const { app, p, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/tool-use`,
        payload: {
          root,
          participant_id: pid,
          tool_name: "Read",
          tool_use_id: "tu_err",
          input: { file_path: "/missing.txt" },
          result: { error: "ENOENT", path: "/missing.txt" },
          success: false,
        },
      });
      expect(res.statusCode).toBe(200);
      const filename = res.json().filename;
      const onDisk = await readFile(
        join(p.sessionDir(sessionId), filename),
        "utf8",
      );
      const parsed = JSON.parse(onDisk);
      expect(parsed).toEqual({
        tool_name: "Read",
        tool_use_id: "tu_err",
        input: { file_path: "/missing.txt" },
        result: { error: "ENOENT", path: "/missing.txt" },
        success: false,
      });
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
        payload: { root, participant_id: pid, content: "hi" },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/turn-end`,
        payload: { root, participant_id: pid },
      });
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/events?root=${encodeURIComponent(root)}`,
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
        payload: { root, participant_id: pid, content: "hi" },
      });
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/turn-end`,
        payload: { root, participant_id: pid },
      });
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/events?root=${encodeURIComponent(root)}&kinds=turn-end`,
      });
      expect(res.json().events).toHaveLength(1);
      await app.close();
    });
  });

  it("reads from an explicit KNOWN background root via ?root= (X2)", async () => {
    await withTempProject(async (fallbackRoot) => {
      await withTempProject(async (eventRoot) => {
        const eventProject = paths(eventRoot);
        await initProject(eventProject);
        const session = await createSession(eventProject, { slug: "path-scope" });
        const [pid] = Object.keys(await listParticipants(eventProject));
        const { app: writer } = createServer({ token: null, paths: eventProject });
        await writer.inject({
          method: "POST",
          url: `/sessions/${session.id}/events/prose`,
          payload: { root: eventRoot, participant_id: pid!, content: "from explicit path" },
        });
        await writer.close();

        const cfg = mkdtempSync(join(tmpdir(), "fmark-ev-cfg-"));
        try {
          const fallbackProject = paths(fallbackRoot);
          await initProject(fallbackProject);
          const g = globalPaths(cfg);
          // Register the event root so it is a KNOWN root for the reader.
          await registerProjectPath(g, eventRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(fallbackRoot),
          });
          const { app } = createServer({
            token: null,
            paths: fallbackProject,
            pathContextRef: ref,
          });
          const res = await app.inject({
            method: "GET",
            url: `/sessions/${session.id}/events?root=${encodeURIComponent(eventRoot)}`,
          });
          expect(res.statusCode).toBe(200);
          expect(res.json().events).toHaveLength(1);
          expect(res.json().events[0].payload.content).toBe("from explicit path");
          await app.close();
        } finally {
          rmSync(cfg, { recursive: true, force: true });
        }
      });
    });
  });

  it("400 ROOT_SCOPE_REQUIRED on GET without a root scope", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/events`,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("ROOT_SCOPE_REQUIRED");
      await app.close();
    });
  });
});

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { listParticipants, registerAgent } from "../../src/participants.js";
import { createSession } from "../../src/sessions.js";
import { writeEventFile } from "../../src/events/writer.js";
import { serializeProse } from "../../src/events/prose.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { registerProjectPath } from "../../src/paths/registry.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { readState } from "../../src/state/store.js";
import { withTempProject } from "../helpers/tempdir.js";
import { createAgentStateStore } from "../../src/services/agentState.js";
import { fakeCommandRunner } from "../../src/tmux/commandRunner.js";
import { fmarkAgentSessionName } from "../../src/tmux/naming.js";

describe("routes /sessions", () => {
  it("POST /sessions creates a session", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/sessions",
        payload: { slug: "demo" },
      });
      expect(res.statusCode).toBe(200);
      const meta = res.json();
      expect(meta.id).toMatch(/-demo$/);
      await app.close();
    });
  });

  it("GET /sessions lists sessions", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      await app.inject({ method: "POST", url: "/sessions", payload: { slug: "a" } });
      await app.inject({ method: "POST", url: "/sessions", payload: { slug: "b" } });
      const res = await app.inject({ method: "GET", url: "/sessions" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessions.length).toBe(2);
      await app.close();
    });
  });

  it("PATCH /sessions/:id renames a session folder", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const created = await app.inject({
        method: "POST",
        url: "/sessions",
        payload: { slug: "before" },
      });
      const id = created.json().id as string;

      const res = await app.inject({
        method: "PATCH",
        url: `/sessions/${id}`,
        payload: { slug: "after" },
      });

      expect(res.statusCode).toBe(200);
      const renamed = res.json();
      expect(renamed.id).toMatch(/-after$/);
      expect(existsSync(join(root, ".f-mark", "sessions", renamed.id))).toBe(
        true,
      );
      expect(existsSync(join(root, ".f-mark", "sessions", id))).toBe(false);
      await app.close();
    });
  });

  it("DELETE /sessions/:id removes only the session folder", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const created = await app.inject({
        method: "POST",
        url: "/sessions",
        payload: { slug: "delete-me" },
      });
      const id = created.json().id as string;

      const res = await app.inject({
        method: "DELETE",
        url: `/sessions/${id}`,
      });

      expect(res.statusCode).toBe(204);
      expect(existsSync(join(root, ".f-mark", "sessions", id))).toBe(false);
      expect(existsSync(join(root, ".f-mark"))).toBe(true);
      await app.close();
    });
  });

  it("requires bearer token when configured", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const res = await app.inject({ method: "GET", url: "/sessions" });
      expect(res.statusCode).toBe(401);
      const ok = await app.inject({
        method: "GET",
        url: "/sessions",
        headers: { authorization: "Bearer secret" },
      });
      expect(ok.statusCode).toBe(200);
      await app.close();
    });
  });

  it("accepts ?token=<token> query param when configured", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const ok = await app.inject({
        method: "GET",
        url: "/sessions?token=secret",
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.headers["set-cookie"]).toMatch(/fmark_token=secret/);
      const bad = await app.inject({
        method: "GET",
        url: "/sessions?token=wrong",
      });
      expect(bad.statusCode).toBe(401);
      await app.close();
    });
  });

  it("accepts fmark_token cookie on subsequent requests", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const ok = await app.inject({
        method: "GET",
        url: "/sessions",
        headers: { cookie: "fmark_token=secret" },
      });
      expect(ok.statusCode).toBe(200);
      const bad = await app.inject({
        method: "GET",
        url: "/sessions",
        headers: { cookie: "fmark_token=wrong" },
      });
      expect(bad.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("multi-path body.path", () => {
    it("creates a session at the chosen path and activates it", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-other-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(fallbackRoot);
          await initProject(p);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(fallbackRoot),
          });
          const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

          const res = await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "alt", path: otherRoot },
          });
          expect(res.statusCode).toBe(200);
          const meta = res.json();
          expect(meta.id).toMatch(/-alt$/);
          // Session folder created under the chosen path, not the fallback.
          expect(existsSync(join(otherRoot, ".f-mark", "sessions", meta.id))).toBe(true);
          expect(existsSync(join(fallbackRoot, ".f-mark", "sessions", meta.id))).toBe(false);
          // The newly selected path is a complete F-Mark project, not a
          // half-created sessions-only tree.
          expect(existsSync(join(otherRoot, ".f-mark", "AGENT.md"))).toBe(true);
          expect(existsSync(join(otherRoot, ".f-mark", "config.json"))).toBe(true);
          expect(existsSync(join(otherRoot, ".f-mark", "runtimes.json"))).toBe(true);
          const config = JSON.parse(
            readFileSync(join(otherRoot, ".f-mark", "config.json"), "utf8"),
          );
          expect(config.port).toBe(7777);
          // Ref + state.json updated.
          expect(ref.get().active?.root()).toBe(otherRoot);
          const state = await readState(g);
          expect(state.activePath).toBe(otherRoot);
          expect(state.knownPaths).toContain(otherRoot);
          expect(ref.revision()).toBe(state.activeRevision);
          const participants = await listParticipants(paths(otherRoot));
          expect(
            Object.values(participants).some((part) => part.kind === "user"),
          ).toBe(true);
          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("mirrors the kernel auth token into newly-created project paths", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-other-auth-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(fallbackRoot);
          await initProject(p);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(fallbackRoot),
          });
          const { app } = createServer({
            token: "secret",
            paths: p,
            pathContextRef: ref,
          });

          const res = await app.inject({
            method: "POST",
            url: "/sessions",
            headers: { authorization: "Bearer secret" },
            payload: { slug: "alt", path: otherRoot },
          });

          expect(res.statusCode).toBe(200);
          const tokenPath = join(otherRoot, ".f-mark", ".token");
          expect(readFileSync(tokenPath, "utf8")).toBe("secret");
          expect(statSync(tokenPath).mode & 0o777).toBe(0o600);
          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("400s when body.path doesn't exist", async () => {
      await withTempProject(async (root) => {
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(root);
          await initProject(p);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({ global: g, active: activePaths(root) });
          const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
          const res = await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "x", path: "/nope/does/not/exist" },
          });
          expect(res.statusCode).toBe(400);
          expect(res.json().code).toBe("PATH_NOT_FOUND");
          await app.close();
        } finally {
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("GET /sessions reads from active path after switch", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-other-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(fallbackRoot);
          await initProject(p);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({ global: g, active: activePaths(fallbackRoot) });
          const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

          // Create one in fallback path.
          await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "fallback-session" },
          });
          // Create one at the other path — activates it.
          await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "other-session", path: otherRoot },
          });

          const res = await app.inject({ method: "GET", url: "/sessions" });
          const ids = res.json().sessions.map((s: { id: string }) => s.id);
          expect(ids.some((id: string) => id.endsWith("-other-session"))).toBe(true);
          expect(ids.some((id: string) => id.endsWith("-fallback-session"))).toBe(false);
          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("GET /sessions?scope=all lists sessions across known paths", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-other-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(fallbackRoot);
          await initProject(p);
          const g = globalPaths(configRoot);
          const ref = new PathContextRef({ global: g, active: activePaths(fallbackRoot) });
          const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

          await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "fallback-session" },
          });
          await app.inject({
            method: "POST",
            url: "/sessions",
            payload: { slug: "other-session", path: otherRoot },
          });

          const res = await app.inject({ method: "GET", url: "/sessions?scope=all" });
          expect(res.statusCode).toBe(200);
          const sessions = res.json().sessions as Array<{
            id: string;
            path: string;
            path_id: string;
          }>;
          const fallback = sessions.find((s) => s.id.endsWith("-fallback-session"));
          const other = sessions.find((s) => s.id.endsWith("-other-session"));
          expect(fallback?.path).toBe(fallbackRoot);
          expect(fallback?.path_id).toBe(activePaths(fallbackRoot).pathId());
          expect(other?.path).toBe(otherRoot);
          expect(other?.path_id).toBe(activePaths(otherRoot).pathId());
          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("GET /sessions?scope=all includes registered project paths", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-registered-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(fallbackRoot);
          await initProject(p);
          await createSession(p, { slug: "fallback-session" });
          const otherPaths = paths(otherRoot);
          await initProject(otherPaths);
          await createSession(otherPaths, { slug: "registered-session" });

          const g = globalPaths(configRoot);
          await registerProjectPath(g, otherRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(fallbackRoot),
          });
          const { app } = createServer({
            token: null,
            paths: p,
            pathContextRef: ref,
          });

          const res = await app.inject({ method: "GET", url: "/sessions?scope=all" });
          expect(res.statusCode).toBe(200);
          const sessions = res.json().sessions as Array<{
            id: string;
            path: string;
          }>;
          expect(
            sessions.some(
              (s) =>
                s.id.endsWith("-registered-session") && s.path === otherRoot,
            ),
          ).toBe(true);
          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("GET /sessions/events?scope=all returns events grouped with path metadata", async () => {
      await withTempProject(async (fallbackRoot) => {
        const otherRoot = mkdtempSync(join(tmpdir(), "fmark-events-"));
        const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
        try {
          const p = paths(fallbackRoot);
          await initProject(p);
          const fallback = await createSession(p, { slug: "fallback-session" });
          const otherPaths = paths(otherRoot);
          await initProject(otherPaths);
          const other = await createSession(otherPaths, {
            slug: "other-session",
          });
          const [fallbackParticipant] = Object.keys(await listParticipants(p));
          const [otherParticipant] = Object.keys(
            await listParticipants(otherPaths),
          );
          await writeEventFile(p, fallback.id, {
            participant_id: fallbackParticipant!,
            kind: "prose",
            ext: "md",
            contents: serializeProse({ content: "fallback body" }),
          });
          await writeEventFile(otherPaths, other.id, {
            participant_id: otherParticipant!,
            kind: "prose",
            ext: "md",
            contents: serializeProse({ content: "other body" }),
          });

          const g = globalPaths(configRoot);
          await registerProjectPath(g, otherRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(fallbackRoot),
          });
          const { app } = createServer({
            token: null,
            paths: p,
            pathContextRef: ref,
          });

          const res = await app.inject({
            method: "GET",
            url: "/sessions/events?scope=all&kinds=prose",
          });
          expect(res.statusCode).toBe(200);
          const groups = res.json().groups as Array<{
            path: string;
            session: { id: string };
            events: Array<{ payload: { content: string } }>;
          }>;
          expect(
            groups.some(
              (group) =>
                group.path === otherRoot &&
                group.session.id === other.id &&
                group.events.some((event) => event.payload.content === "other body"),
            ),
          ).toBe(true);
          await app.close();
        } finally {
          rmSync(otherRoot, { recursive: true, force: true });
          rmSync(configRoot, { recursive: true, force: true });
        }
      });
    });

    it("GET /sessions returns [] when active path has no .f-mark/", async () => {
      const fresh = mkdtempSync(join(tmpdir(), "fmark-fresh-"));
      const configRoot = mkdtempSync(join(tmpdir(), "fmark-cfg-"));
      try {
        const p = paths(fresh);
        // Note: NO initProject — fresh dir has no .f-mark/.
        const g = globalPaths(configRoot);
        const ref = new PathContextRef({ global: g, active: activePaths(fresh) });
        const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
        const res = await app.inject({ method: "GET", url: "/sessions" });
        expect(res.statusCode).toBe(200);
        expect(res.json().sessions).toEqual([]);
        // listSessions must NOT have created .f-mark/ in the fresh dir.
        expect(existsSync(join(fresh, ".f-mark"))).toBe(false);
        await app.close();
      } finally {
        rmSync(fresh, { recursive: true, force: true });
        rmSync(configRoot, { recursive: true, force: true });
      }
    });
  });

  describe("POST /sessions/:id/fork — fork-link events", () => {
    async function makeForkable(root: string): Promise<{
      p: ReturnType<typeof paths>;
      sourceId: string;
    }> {
      const p = paths(root);
      await initProject(p);
      const source = await createSession(p, { slug: "src" });
      // Seed one event so the source has something other than .fork.json.
      await writeEventFile(p, source.id, {
        participant_id: Object.keys(
          (await listParticipants(p)),
        ).find((id) => id.startsWith("us-"))!,
        kind: "prose",
        ext: "md",
        contents: serializeProse({ content: "hello" }),
      });
      return { p, sourceId: source.id };
    }

    function listEventFiles(sessionDir: string): string[] {
      const { readdirSync } = require("node:fs") as typeof import("node:fs");
      return readdirSync(sessionDir).filter(
        (n: string) => !n.startsWith(".") && !n.includes(".tmp"),
      );
    }

    function readJsonEvent<T = unknown>(
      sessionDir: string,
      filename: string,
    ): { kind: string; payload: T; participant_id: string } {
      const raw = readFileSync(join(sessionDir, filename), "utf8");
      const payload = JSON.parse(raw) as T;
      // The on-disk event file is just the payload; route+filename
      // carry kind + participant. Re-derive from filename for assertions.
      const m =
        /^(\d{8}T\d{6}(?:\.\d{3})?Z)_((?:us|ag|sys|grp)-[a-z0-9-]{2,12})\.([a-z-]+)\.json$/.exec(
          filename,
        );
      return {
        kind: m?.[3] ?? "?",
        payload,
        participant_id: m?.[2] ?? "?",
      };
    }

    it("writes fork-link(to) into source and fork-link(from) into fork; sys-fork is created", async () => {
      await withTempProject(async (root) => {
        const { p, sourceId } = await makeForkable(root);
        const { app } = createServer({ token: null, paths: p });
        const res = await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "child" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        const forkId = body.session.id;
        expect(body.warnings ?? []).toEqual([]);

        const sourceFiles = listEventFiles(p.sessionDir(sourceId));
        const forkFiles = listEventFiles(p.sessionDir(forkId));

        const sourceLinks = sourceFiles.filter((f: string) =>
          f.endsWith("fork-link.json"),
        );
        const forkLinks = forkFiles.filter((f: string) =>
          f.endsWith("fork-link.json"),
        );
        expect(sourceLinks.length).toBe(1);
        expect(forkLinks.length).toBe(1);

        const srcEv = readJsonEvent<{
          direction: string;
          other_session_id: string;
          other_session_slug: string;
        }>(p.sessionDir(sourceId), sourceLinks[0]!);
        expect(srcEv.kind).toBe("fork-link");
        expect(srcEv.participant_id).toBe("sys-fork");
        expect(srcEv.payload.direction).toBe("to");
        expect(srcEv.payload.other_session_id).toBe(forkId);
        expect(srcEv.payload.other_session_slug).toBe("child");

        const forkEv = readJsonEvent<{
          direction: string;
          other_session_id: string;
          other_session_slug: string;
        }>(p.sessionDir(forkId), forkLinks[0]!);
        expect(forkEv.payload.direction).toBe("from");
        expect(forkEv.payload.other_session_id).toBe(sourceId);
        expect(forkEv.payload.other_session_slug).toBe("src");

        const participants = await listParticipants(p);
        expect(participants["sys-fork"]).toBeDefined();
        expect(participants["sys-fork"]!.kind).toBe("sys");

        // Regression: .fork.json still written.
        expect(existsSync(join(p.sessionDir(forkId), ".fork.json"))).toBe(true);

        await app.close();
      });
    });

    it("does not duplicate sys-fork across two forks", async () => {
      await withTempProject(async (root) => {
        const { p, sourceId } = await makeForkable(root);
        const { app } = createServer({ token: null, paths: p });
        await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "a" },
        });
        await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "b" },
        });
        const participants = await listParticipants(p);
        const sysForkRows = Object.entries(participants).filter(
          ([id]) => id === "sys-fork",
        );
        expect(sysForkRows.length).toBe(1);
        await app.close();
      });
    });

    it("second fork from same source does NOT copy the first fork's source-side fork-link", async () => {
      await withTempProject(async (root) => {
        const { p, sourceId } = await makeForkable(root);
        const { app } = createServer({ token: null, paths: p });
        const r1 = await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "a" },
        });
        const r2 = await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "b" },
        });
        const aId = r1.json().session.id;
        const bId = r2.json().session.id;

        // Source now has TWO fork-link(to) events (one per fork).
        const sourceLinks = listEventFiles(p.sessionDir(sourceId)).filter(
          (f: string) => f.endsWith("fork-link.json"),
        );
        expect(sourceLinks.length).toBe(2);

        // Fork b must contain EXACTLY one fork-link, its own (from src),
        // not the source-side "to a" marker that exists in source.
        const bLinks = listEventFiles(p.sessionDir(bId)).filter((f: string) =>
          f.endsWith("fork-link.json"),
        );
        expect(bLinks.length).toBe(1);
        const bEv = readJsonEvent<{
          direction: string;
          other_session_id: string;
        }>(p.sessionDir(bId), bLinks[0]!);
        expect(bEv.payload.direction).toBe("from");
        expect(bEv.payload.other_session_id).toBe(sourceId);

        // Fork a is unaffected.
        const aLinks = listEventFiles(p.sessionDir(aId)).filter((f: string) =>
          f.endsWith("fork-link.json"),
        );
        expect(aLinks.length).toBe(1);

        await app.close();
      });
    });

    it("fork-of-a-fork does NOT inherit the parent fork's fork-link(from)", async () => {
      await withTempProject(async (root) => {
        const { p, sourceId } = await makeForkable(root);
        const { app } = createServer({ token: null, paths: p });
        const r1 = await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "child" },
        });
        const childId = r1.json().session.id;
        const r2 = await app.inject({
          method: "POST",
          url: `/sessions/${childId}/fork`,
          payload: { name: "grandchild" },
        });
        const grandchildId = r2.json().session.id;

        const gLinks = listEventFiles(p.sessionDir(grandchildId)).filter(
          (f: string) => f.endsWith("fork-link.json"),
        );
        expect(gLinks.length).toBe(1);
        const gEv = readJsonEvent<{
          direction: string;
          other_session_id: string;
        }>(p.sessionDir(grandchildId), gLinks[0]!);
        // Direction is "from"; other = child (the immediate parent),
        // NOT the original source.
        expect(gEv.payload.direction).toBe("from");
        expect(gEv.payload.other_session_id).toBe(childId);
        await app.close();
      });
    });

    it("repairs an existing sys-fork row with wrong kind", async () => {
      await withTempProject(async (root) => {
        const { p, sourceId } = await makeForkable(root);
        // First fork bootstraps participants.json with a correct sys-fork row.
        const { app } = createServer({ token: null, paths: p });
        await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "bootstrap" },
        });
        // Corrupt the sys-fork row directly on disk.
        const {
          writeFileSync,
          readFileSync: rf,
        } = require("node:fs") as typeof import("node:fs");
        const file = join(p.fmarkDir(), "participants.json");
        const current = JSON.parse(rf(file, "utf8"));
        current.participants["sys-fork"] = {
          kind: "agent",
          name: "Bogus",
          color: "#ff0000",
        };
        writeFileSync(file, JSON.stringify(current, null, 2));

        // Second fork must repair the row.
        await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "x" },
        });
        const fixed = await listParticipants(p);
        expect(fixed["sys-fork"]!.kind).toBe("sys");
        expect(fixed["sys-fork"]!.name).toBe("Fork");
        await app.close();
      });
    });

    it("does not move a live source agent when fork duplication is unsupported", async () => {
      await withTempProject(async (root) => {
        const { p, sourceId } = await makeForkable(root);
        await registerAgent(p, {
          name: "Claude",
          suggested_id: "ag-claude",
          runtime_id: "claude",
          knownRuntimeIds: new Set(["claude", "codex", "opencode"]),
        });
        const agentState = createAgentStateStore({ fallback: p });
        const tmuxSession = fmarkAgentSessionName(root, "ag-claude");
        await agentState.writeActiveSession("ag-claude", sourceId);
        await agentState.writeRuntime("ag-claude", "claude");
        await agentState.writeTmuxSession("ag-claude", tmuxSession);

        const runner = fakeCommandRunner();
        runner.expect(["tmux", "ls"], {
          stdout: `${tmuxSession}\n`,
          stderr: "",
          exitCode: 0,
        });
        runner.expect(["tmux", "show-options"], {
          stdout: `${root}\n`,
          stderr: "",
          exitCode: 0,
        });
        const { app } = createServer({
          token: null,
          paths: p,
          commandRunner: runner,
          allowProcessApiNoAuth: true,
        });

        const res = await app.inject({
          method: "POST",
          url: `/sessions/${sourceId}/fork`,
          payload: { name: "child" },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.agents).toEqual([
          expect.objectContaining({
            participant_id: "ag-claude",
            status: "skipped-unsupported",
          }),
        ]);
        const participants = await listParticipants(p, { agentState });
        expect(participants["ag-claude"]?.active_session).toBe(sourceId);
        expect(await agentState.readActiveSession("ag-claude")).toBe(sourceId);
        expect(body.warnings.join("\n")).toContain(
          "source agent was left attached",
        );
        runner.verifyExpectationsConsumed();
        await app.close();
      });
    });
  });
});

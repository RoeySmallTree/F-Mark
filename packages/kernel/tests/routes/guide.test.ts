import { describe, it, expect } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject, readConfig, writeConfig } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("GET /guide", () => {
  it("returns markdown including the dynamic base URL", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide",
        headers: { host: "example.test:9999" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/markdown/);
      expect(res.body).toContain("http://example.test:9999");
      expect(res.body).toContain("Verify your tooling");
      expect(res.body).toContain("`.claude/skills/f-mark/SKILL.md`");
      await app.close();
    });
  });

  it("removes the stale 'Hooks (NOT YET SHIPPED)' text", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({ method: "GET", url: "/guide" });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain("NOT YET SHIPPED");
      await app.close();
    });
  });

  it("backward-compat: accepts sessionId (camelCase) as alias for session_id", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "alias" });
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: `/guide?sessionId=${session.id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain(session.id);
      await app.close();
    });
  });

  it("accepts session_id (snake_case) query param", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "snake" });
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: `/guide?session_id=${session.id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain(session.id);
      await app.close();
    });
  });

  it("accepts agent_id query param and substitutes in instructions", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?agent_id=ag-claude-99",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("ag-claude-99");
      await app.close();
    });
  });

  it("accepts runtime_id=claude and renders Claude-specific hook install", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=claude&agent_id=ag-claude-1",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("~/.claude/settings.json");
      expect(res.body).toContain("ag-claude-1");
      await app.close();
    });
  });

  it("accepts runtime_id=codex and renders codex config.toml snippet", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=codex&agent_id=ag-codex-1",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatch(/codex/i);
      expect(res.body).toContain("ag-codex-1");
      expect(res.body).toContain("~/.codex/config.toml");
      await app.close();
    });
  });

  it("accepts runtime_id=gemini and notes manual-stream mode", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=gemini",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatch(/manual-stream/i);
      await app.close();
    });
  });

  it("includes session-specific section when sessionId is supplied", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "demo" });
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: `/guide?sessionId=${session.id}`,
        headers: { host: "localhost:7777" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain(`Session id:** \`${session.id}\``);
      expect(res.body).toContain("First action — say hello");
      expect(res.body).toContain(`/events/prose`);
      await app.close();
    });
  });

  it("returns 404 for unknown sessionId", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?sessionId=no-such",
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("falls back to no-session message when sessionId is not supplied", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({ method: "GET", url: "/guide" });
      expect(res.body).toContain("No session selected");
      await app.close();
    });
  });

  it("Claude hook snippet uses the real user participant id from config", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      // Add a known user participant id.
      const cfg = await readConfig(p);
      cfg.participants = {
        "us-alice": { kind: "user", name: "Alice", color: "#3b82f6" },
      };
      await writeConfig(p, cfg);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=claude&agent_id=ag-claude-1",
      });
      expect(res.statusCode).toBe(200);
      // The agent placeholder for Stop hook
      expect(res.body).toContain("ag-claude-1");
      // The user placeholder for UserPromptSubmit hook must be the real id
      expect(res.body).toContain("us-alice");
      // The default placeholder must not appear when a real user exists
      expect(res.body).not.toContain("us-yourname");
      await app.close();
    });
  });

  it("Codex hook snippet uses the real user participant id from config", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const cfg = await readConfig(p);
      cfg.participants = {
        "us-bob": { kind: "user", name: "Bob", color: "#3b82f6" },
      };
      await writeConfig(p, cfg);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=codex&agent_id=ag-codex-2",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("ag-codex-2");
      expect(res.body).toContain("us-bob");
      expect(res.body).not.toContain("us-yourname");
      await app.close();
    });
  });

  it("falls back to us-yourname when no user participant is registered", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      // Replace participants with only agents.
      const cfg = await readConfig(p);
      cfg.participants = {
        "ag-only": { kind: "agent", name: "Solo", color: "#10b981" },
      };
      await writeConfig(p, cfg);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=claude&agent_id=ag-claude-9",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("us-yourname");
      await app.close();
    });
  });
});

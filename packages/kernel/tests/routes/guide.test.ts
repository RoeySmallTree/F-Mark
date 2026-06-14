import { describe, it, expect } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject, readConfig, writeConfig } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("GET /guide", () => {
  it("returns MCP-first markdown without REST protocol guidance", async () => {
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
      expect(res.body).toContain("MCP-first guide");
      expect(res.body).toContain("fmark_post_prose");
      expect(res.body).toContain("fmark_end_turn");
      expect(res.body).toContain("fmark_read_events");
      expect(res.body).toContain("fmark://guide");
      expect(res.body).not.toContain("http://example.test:9999");
      expect(res.body).not.toContain("curl");
      expect(res.body).not.toContain("POST /sessions");
      expect(res.body).not.toContain("Authorization: Bearer");
      await app.close();
    });
  });

  it("returns the MCP guide even when the static AGENT.md fallback is missing", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("MCP-first guide");
      expect(res.body).toContain("fmark_post_prose");
      await app.close();
    });
  });

  it("keeps the REST protocol reference on /guide-rest-variant", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "rest-guide" });
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: `/guide-rest-variant?session_id=${session.id}&agent_id=ag-guide`,
        headers: { host: "example.test:9999" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/markdown/);
      expect(res.body).toContain("http://example.test:9999");
      expect(res.body).toContain("Verify your tooling");
      expect(res.body).toContain("`.claude/skills/f-mark/SKILL.md`");
      expect(res.body).toContain("curl");
      expect(res.body).toContain("POST /sessions");
      expect(res.body).toContain("Authorization: Bearer");
      await app.close();
    });
  });

  it("includes the Responding to Comments section that dereferences append_to + lines", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({ method: "GET", url: "/guide" });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("Responding to Comments");
      expect(res.body).toContain("append_to");
      expect(res.body).toContain("lines");
      /* The primary instruction uses fmark_read_events for parsed
         payloads — fmark_read_event returns raw markdown that needs
         frontmatter stripping, so prefer the parsed path. */
      expect(res.body).toContain("fmark_read_events");
      /* The 1-indexed semantics is called out so agents don't off-by-one. */
      expect(res.body).toContain("1-indexed");
      /* Reply preserves `lines` when the original comment had them. */
      expect(res.body).toMatch(/same `lines`/);
      /* And uses in_reply_to on the comment's filename to thread. */
      expect(res.body).toContain("in_reply_to");
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

  it("accepts runtime_id=claude and renders Claude MCP wording", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=claude&agent_id=ag-claude-1",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("Claude exposes these as MCP tools");
      expect(res.body).toContain("mcp__fmark__fmark_post_prose");
      expect(res.body).toContain("ag-claude-1");
      expect(res.body).not.toContain("~/.claude/settings.json");
      await app.close();
    });
  });

  it("accepts runtime_id=codex and renders Codex MCP wording", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=codex&agent_id=ag-codex-1",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("Codex exposes these as MCP tools");
      expect(res.body).toContain("Prefer the MCP tools over shell commands");
      expect(res.body).toContain("ag-codex-1");
      expect(res.body).not.toContain("~/.codex/config.toml");
      await app.close();
    });
  });

  it("accepts runtime_id=opencode and renders generic MCP wording", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: "/guide?runtime_id=opencode",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("Use the F-Mark MCP tools from the `fmark` server");
      expect(res.body).toContain("fmark_post_prose");
      expect(res.body).not.toMatch(/manual-stream/i);
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
      expect(res.body).toContain(`Your F-Mark session id:** \`${session.id}\``);
      expect(res.body).toContain("Immediately call `fmark_post_prose`");
      expect(res.body).toContain(`"session_id": "${session.id}"`);
      expect(res.body).not.toContain(`/events/prose`);
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
      expect(res.body).toContain("No F-Mark session id was pinned");
      expect(res.body).toContain("Ask the user which session to join before writing");
      await app.close();
    });
  });

  it("Claude hook snippet is generic and does not include participant ids", async () => {
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
        url: "/guide-rest-variant?runtime_id=claude&agent_id=ag-claude-1",
      });
      expect(res.statusCode).toBe(200);
      const hookSection = res.body.slice(
        res.body.indexOf("### Hooks (Claude Code)"),
        res.body.indexOf("## No session selected"),
      );
      expect(hookSection).toContain("hook auto-stream");
      expect(hookSection).not.toContain("npx -y f-mark");
      expect(hookSection).not.toContain("ag-claude-1");
      expect(hookSection).not.toContain("us-alice");
      expect(hookSection).not.toContain("UserPromptSubmit");
      expect(hookSection).not.toContain("us-yourname");
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
        url: "/guide-rest-variant?runtime_id=codex&agent_id=ag-codex-2",
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
        url: "/guide-rest-variant?runtime_id=claude&agent_id=ag-claude-9",
      });
      expect(res.statusCode).toBe(200);
      const hookSection = res.body.slice(
        res.body.indexOf("### Hooks (Claude Code)"),
        res.body.indexOf("## No session selected"),
      );
      expect(hookSection).not.toContain("us-yourname");
      expect(hookSection).not.toContain("ag-claude-9");
      await app.close();
    });
  });
});

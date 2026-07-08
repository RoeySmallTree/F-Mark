import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFmarkMcpTools } from "../../src/mcp/tools.js";
import { paths } from "../../src/paths.js";
import { initProject } from "../../src/project.js";
import { createSession } from "../../src/sessions.js";
import { writeActiveSession } from "../../src/agents/activeSession.js";
import { withTempProject } from "../helpers/tempdir.js";
import { join } from "node:path";

/* Phase 2 (X2) regression: every MCP event read/write must now carry a
   required root scope. These tests intercept the outgoing kernel request and
   assert the root scope is present (and that the legacy `path` envelope is
   gone). The kernel routes reject unscoped event reads/writes, so any MCP
   tool that silently relies on the active root would 400 in production. */

interface CapturedTool {
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

function captureTools(root: string): Map<string, CapturedTool> {
  const tools = new Map<string, CapturedTool>();
  const fakeServer = {
    registerTool(
      name: string,
      _config: unknown,
      handler: CapturedTool["handler"],
    ) {
      tools.set(name, { handler });
    },
  };
  /* Pin context resolution to the temp project (env-empty so no stray
     F_MARK_* leakage from the test runner). */
  registerFmarkMcpTools(fakeServer as unknown as McpServer, {
    includeProcessSpawningTools: true,
    path: root,
    env: {},
  });
  return tools;
}

interface CapturedRequest {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

let captured: CapturedRequest[] = [];
let realFetch: typeof globalThis.fetch;

beforeEach(() => {
  captured = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    let body: Record<string, unknown> | undefined;
    if (typeof init?.body === "string" && init.body.length > 0) {
      body = JSON.parse(init.body) as Record<string, unknown>;
    }
    captured.push({ url, method: init?.method ?? "GET", body });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : "");
}

describe("MCP event tools carry required root scope (X2)", () => {
  it("fmark_read_events sends root in the querystring (no unscoped read)", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p, 7654);
      const session = await createSession(p, { slug: "scope" });

      const tools = captureTools(root);
      await tools.get("fmark_read_events")!.handler({
        session_id: session.id,
        participant_id: "ag-1",
      });

      expect(captured).toHaveLength(1);
      const req = captured[0]!;
      expect(req.method).toBe("GET");
      expect(req.url).toContain(`/sessions/${session.id}/events`);
      expect(parseQuery(req.url).get("root")).toBe(root);
    });
  });

  it("event POST tools send root scope and no legacy path envelope", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p, 7655);
      const session = await createSession(p, { slug: "scope" });
      /* Link the agent so resolveWriteContext resolves participant + session. */
      await writeActiveSession(
        join(p.fmarkDir(), "agents"),
        "ag-1",
        session.id,
      );

      const tools = captureTools(root);
      const base = { session_id: session.id, participant_id: "ag-1" };

      const cases: Array<{ name: string; input: Record<string, unknown> }> = [
        {
          name: "fmark_post_prose",
          input: {
            ...base,
            content: "hello",
            file_path: "src/a.ts",
            diff_hunk: "@@ -1 +1 @@",
            diff_base: "HEAD",
            line_context: { selected: "x", sha256: "abc" },
          },
        },
        {
          name: "fmark_post_todo",
          input: { ...base, id: "t1", title: "T", status: "open" },
        },
        {
          name: "fmark_post_tool_use",
          input: {
            ...base,
            tool_name: "Bash",
            tool_use_id: "tu1",
            input: { cmd: "ls" },
            success: true,
          },
        },
        {
          name: "fmark_post_choices",
          input: {
            ...base,
            id: "c1",
            question: "Q",
            options: [{ id: "o1", label: "A" }],
            multi: false,
          },
        },
        {
          name: "fmark_post_choice",
          input: { ...base, choices_id: "c1", selected: ["o1"] },
        },
        {
          name: "fmark_post_alternatives",
          input: {
            ...base,
            id: "a1",
            question: "Q",
            options: [{ id: "o1", label: "A", html: "<p>a</p>" }],
            multi: false,
          },
        },
        {
          name: "fmark_post_flow",
          input: { ...base, id: "f1", nodes: [], edges: [] },
        },
        {
          name: "fmark_post_html",
          input: { ...base, html: "<p>hi</p>" },
        },
        {
          name: "fmark_post_file_ref",
          input: {
            ...base,
            id: "r1",
            path: "src/a.ts",
            mime_type: "text/plain",
          },
        },
        { name: "fmark_end_turn", input: { ...base } },
      ];

      for (const c of cases) {
        captured = [];
        await tools.get(c.name)!.handler(c.input);
        expect(captured.length, c.name).toBeGreaterThanOrEqual(1);
        const req = captured[0]!;
        expect(req.method, c.name).toBe("POST");
        expect(req.body, c.name).toBeDefined();
        /* Required root scope present. */
        expect(req.body!.root, c.name).toBe(root);
        /* Legacy path envelope removed. file_ref carries `path` as the FILE
           path business field, so only assert the envelope is gone elsewhere. */
        if (c.name !== "fmark_post_file_ref") {
          expect(req.body!.path, c.name).toBeUndefined();
        }
      }
    });
  });

  it("fmark_post_prose preserves file/diff/line-context fields alongside scope", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p, 7656);
      const session = await createSession(p, { slug: "scope" });
      await writeActiveSession(
        join(p.fmarkDir(), "agents"),
        "ag-1",
        session.id,
      );

      const tools = captureTools(root);
      await tools.get("fmark_post_prose")!.handler({
        session_id: session.id,
        participant_id: "ag-1",
        content: "comment",
        file_path: "src/a.ts",
        diff_hunk: "@@ -1 +1 @@",
        diff_base: "HEAD",
        line_context: { selected: "const x = 1", sha256: "deadbeef" },
      });

      const body = captured[0]!.body!;
      expect(body.root).toBe(root);
      expect(body.file_path).toBe("src/a.ts");
      expect(body.diff_hunk).toBe("@@ -1 +1 @@");
      expect(body.diff_base).toBe("HEAD");
      expect(body.line_context).toEqual({
        selected: "const x = 1",
        sha256: "deadbeef",
      });
      expect(body.path).toBeUndefined();
    });
  });
});

describe("MCP session and participant tools scope to the context root", () => {
  it("session tools target the context root instead of ambient active state", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p, 7657);
      const tools = captureTools(root);

      await tools.get("fmark_list_sessions")!.handler({});
      expect(captured).toHaveLength(1);
      expect(captured[0]!.method).toBe("GET");
      expect(captured[0]!.url).toContain("/sessions?");
      expect(parseQuery(captured[0]!.url).get("root")).toBe(root);

      captured = [];
      await tools.get("fmark_create_session")!.handler({ slug: "mcp-scope" });
      expect(captured).toHaveLength(1);
      expect(captured[0]!.method).toBe("POST");
      expect(captured[0]!.url).toContain("/sessions");
      expect(captured[0]!.body).toMatchObject({ slug: "mcp-scope", path: root });

      captured = [];
      await tools.get("fmark_rename_session")!.handler({
        session_id: "session-a",
        slug: "fix-login-flow",
      });
      expect(captured).toHaveLength(1);
      expect(captured[0]!.method).toBe("PATCH");
      expect(captured[0]!.url).toContain("/sessions/session-a");
      expect(captured[0]!.body).toMatchObject({
        slug: "fix-login-flow",
        root,
      });

      captured = [];
      await tools.get("fmark_fork_session")!.handler({
        session_id: "session-a",
        path: "feature",
      });
      expect(captured).toHaveLength(1);
      expect(captured[0]!.method).toBe("POST");
      expect(captured[0]!.url).toContain("/sessions/session-a/fork");
      expect(captured[0]!.body).toMatchObject({
        path: "feature",
        root,
      });
    });
  });

  it("participant tools target the context root", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p, 7658);
      const tools = captureTools(root);

      await tools.get("fmark_list_participants")!.handler({});
      expect(captured).toHaveLength(1);
      expect(captured[0]!.method).toBe("GET");
      expect(captured[0]!.url).toContain("/participants?");
      expect(parseQuery(captured[0]!.url).get("root")).toBe(root);

      captured = [];
      await tools.get("fmark_register_agent")!.handler({
        name: "MCP Agent",
        suggested_id: "ag-mcp",
      });
      expect(captured).toHaveLength(1);
      expect(captured[0]!.method).toBe("POST");
      expect(captured[0]!.url).toContain("/participants/register?");
      expect(parseQuery(captured[0]!.url).get("root")).toBe(root);
      expect(captured[0]!.body).toMatchObject({
        kind: "agent",
        name: "MCP Agent",
        suggested_id: "ag-mcp",
      });

      captured = [];
      await tools.get("fmark_link_agent")!.handler({
        participant_id: "ag-mcp",
        session_id: "session-a",
      });
      expect(captured).toHaveLength(1);
      expect(captured[0]!.method).toBe("POST");
      expect(captured[0]!.url).toContain("/agents/ag-mcp/link");
      expect(captured[0]!.body).toMatchObject({
        session_id: "session-a",
        root,
      });
    });
  });
});

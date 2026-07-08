import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  FMARK_CLAUDE_ALLOW_ENTRIES,
  FMARK_MCP_TOOL_NAMES,
  registerFmarkMcpTools,
} from "../../src/mcp/tools.js";

interface CapturedTool {
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, z.ZodType>;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
    };
  };
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

function captureTools(): Map<string, CapturedTool> {
  const tools = new Map<string, CapturedTool>();
  const fakeServer = {
    registerTool(
      name: string,
      config: CapturedTool["config"],
      handler: CapturedTool["handler"],
    ) {
      tools.set(name, { config, handler });
    },
  };
  registerFmarkMcpTools(fakeServer as unknown as McpServer, {
    includeProcessSpawningTools: false,
  });
  return tools;
}

function schemaFor(
  tools: Map<string, CapturedTool>,
  name: string,
): Record<string, z.ZodType> {
  const schema = tools.get(name)?.config.inputSchema;
  if (schema === undefined) throw new Error(`missing schema for ${name}`);
  return schema;
}

describe("MCP tool schemas", () => {
  it("registers the Phase 5 minimal tool surface", () => {
    const tools = captureTools();

    expect([...tools.keys()]).toEqual(
      expect.arrayContaining([
        "fmark_read_events",
        "fmark_post_prose",
        "fmark_end_turn",
      ]),
    );
  });

  it("keeps fmark_read_events read-only and context-addressable", () => {
    const tools = captureTools();
    const tool = tools.get("fmark_read_events");
    expect(tool?.config.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });

    const schema = schemaFor(tools, "fmark_read_events");
    expect(schema.session_id.safeParse("session-1").success).toBe(true);
    expect(schema.participant_id.safeParse("ag-phase5").success).toBe(true);
    expect(schema.since.safeParse("20260526T000000Z").success).toBe(true);
    expect(schema.kinds.safeParse(["prose", "turn-end"]).success).toBe(true);
    expect(schema.kinds.safeParse("prose").success).toBe(false);
  });

  it("keeps fmark_post_prose writable and Codex-compatible for lines", () => {
    const tools = captureTools();
    const tool = tools.get("fmark_post_prose");
    expect(tool?.config.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });

    const schema = schemaFor(tools, "fmark_post_prose");
    expect(schema.content.safeParse("hello").success).toBe(true);
    expect(schema.lines.safeParse([1, 2]).success).toBe(true);
    expect(schema.lines.safeParse([1]).success).toBe(false);
    expect(schema.lines.safeParse([1, 2, 3]).success).toBe(false);
    expect(schema.lines.safeParse(["1", 2]).success).toBe(false);
    expect(schema.mode.safeParse("comment").success).toBe(true);
    expect(schema.mode.safeParse("aside").success).toBe(false);
    expect(schema.arbitrary.safeParse(true).success).toBe(true);
    expect(schema.arbitrary.safeParse("true").success).toBe(false);
  });

  it("keeps fmark_end_turn writable with optional context only", () => {
    const tools = captureTools();
    const tool = tools.get("fmark_end_turn");
    expect(tool?.config.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });

    const schema = schemaFor(tools, "fmark_end_turn");
    expect(Object.keys(schema).sort()).toEqual([
      "participant_id",
      "session_id",
    ]);
    expect(schema.session_id.safeParse(undefined).success).toBe(true);
    expect(schema.participant_id.safeParse(undefined).success).toBe(true);
    expect(schema.session_id.safeParse("session-1").success).toBe(true);
    expect(schema.participant_id.safeParse("ag-phase5").success).toBe(true);
  });

  it("exposes fmark_get_theme as a read-only tool with an optional theme override", () => {
    const tools = captureTools();
    expect([...tools.keys()]).toContain("fmark_get_theme");
    expect(FMARK_MCP_TOOL_NAMES).toContain("fmark_get_theme");

    const tool = tools.get("fmark_get_theme");
    expect(tool?.config.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });

    const schema = schemaFor(tools, "fmark_get_theme");
    expect(Object.keys(schema)).toEqual(["theme", "font"]);
    /* Optional + treats empty string as absent (opencode populates optionals). */
    expect(schema.theme.safeParse(undefined).success).toBe(true);
    expect(schema.theme.safeParse("ember").success).toBe(true);
    expect(schema.theme.parse("")).toBeUndefined();
    expect(schema.font.safeParse(undefined).success).toBe(true);
    expect(schema.font.parse("")).toBeUndefined();
  });

  it("documents visual alternatives multi-select semantics in the tool schema", () => {
    const tools = captureTools();
    const tool = tools.get("fmark_post_alternatives");
    expect(tool?.config.description).toContain("multi:false");
    expect(tool?.config.description).toContain("multi:true");
    expect(tool?.config.description).toContain("multi-select cue");

    const schema = schemaFor(tools, "fmark_post_alternatives");
    expect(schema.multi.description).toContain("pick exactly one");
    expect(schema.multi.description).toContain("pick any number");
  });

  it("write tools carry point-of-action worked examples", () => {
    const tools = captureTools();
    for (const name of [
      "fmark_post_prose",
      "fmark_post_html",
      "fmark_post_flow",
      "fmark_post_todo",
      "fmark_post_alternatives",
      "fmark_post_choices",
      "fmark_post_choice",
      "fmark_post_tool_use",
      "fmark_post_file_ref",
      "fmark_end_turn",
    ]) {
      const desc = tools.get(name)?.config.description ?? "";
      expect(desc, `${name} description should carry an Example:`).toContain(
        "Example:",
      );
    }
    expect(tools.get("fmark_post_html")?.config.description).toContain("Avoid:");
  });

  it("classifies HTML by design target, not posting surface", () => {
    const tools = captureTools();
    for (const name of ["fmark_post_html", "fmark_post_alternatives"]) {
      const desc = tools.get(name)?.config.description ?? "";
      expect(desc, `${name} names the three visual targets`).toContain(
        "target-repo-ui",
      );
      expect(desc).toContain("fmark-ui");
      expect(desc).toContain("session-artifact");
      expect(desc, `${name} defaults unbound artifacts to Amber`).toContain(
        "Amber",
      );
      expect(desc, `${name} drops the old branch vocabulary`).not.toContain(
        "external-product",
      );
      expect(desc).not.toContain("fmark-product-mockup");
    }
    const theme = tools.get("fmark_get_theme")?.config.description ?? "";
    expect(theme).toContain("target-repo-ui");
    expect(theme).toContain("session-artifact");
  });

  it("FMARK_MCP_TOOL_NAMES stays in sync with registerTool calls", () => {
    /* Includes process-spawning tools so the static list covers
       fmark_fork_session too — the registrar gates registration on the
       option, but the canonical allow-list should match the full surface. */
    const tools = new Map<string, CapturedTool>();
    const fakeServer = {
      registerTool(
        name: string,
        config: CapturedTool["config"],
        handler: CapturedTool["handler"],
      ) {
        tools.set(name, { config, handler });
      },
    };
    registerFmarkMcpTools(fakeServer as unknown as McpServer, {
      includeProcessSpawningTools: true,
    });
    const registered = [...tools.keys()].sort();
    const declared = [...FMARK_MCP_TOOL_NAMES].sort();
    expect(declared).toEqual(registered);
    expect(FMARK_CLAUDE_ALLOW_ENTRIES).toEqual(
      FMARK_MCP_TOOL_NAMES.map((name) => `mcp__fmark__${name}`),
    );
  });
});

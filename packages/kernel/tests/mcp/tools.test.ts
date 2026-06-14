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

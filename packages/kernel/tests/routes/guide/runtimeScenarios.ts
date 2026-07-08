import {
  expectBodyContains,
  expectBodyExcludes,
  expectStatus,
} from "./assertions.js";
import { withGuideApp } from "./harness.js";
import { getGuide } from "./requests.js";

export async function acceptsRuntimeClaude(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app, {
      query: { runtime_id: "claude", agent_id: "ag-claude-1" },
    });
    expectStatus(res, 200);
    expectBodyContains(
      res,
      "Claude exposes these as MCP tools",
      "mcp__fmark__fmark_post_prose",
      "ag-claude-1",
    );
    expectBodyExcludes(res, "~/.claude/settings.json");
  });
}

export async function acceptsRuntimeCodex(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app, {
      query: { runtime_id: "codex", agent_id: "ag-codex-1" },
    });
    expectStatus(res, 200);
    expectBodyContains(
      res,
      "Codex exposes these as MCP tools",
      "Prefer the MCP tools over shell commands",
      "ag-codex-1",
    );
    expectBodyExcludes(res, "~/.codex/config.toml");
  });
}

export async function acceptsRuntimeOpencode(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app, { query: { runtime_id: "opencode" } });
    expectStatus(res, 200);
    expectBodyContains(
      res,
      "Use the F-Mark MCP tools from the `fmark` server",
      "fmark_post_prose",
    );
    expectBodyExcludes(res, /manual-stream/i);
  });
}

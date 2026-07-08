import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FmarkMcpServerOptions } from "./server.js";
import { registerControlTools } from "./tools/controlTools.js";
import { registerParticipantTools } from "./tools/participantTools.js";
import { registerResourceTools } from "./tools/resourceTools.js";
import { registerSessionTools } from "./tools/sessionTools.js";
import { registerWriteEventTools } from "./tools/writeEventToolGroup.js";

export { optionalRef } from "./tools/schemas.js";

/**
 * Canonical list of F-Mark MCP tool names, kept in sync with the
 * grouped `server.registerTool(name, ...)` calls used by
 * `registerFmarkMcpTools`.
 * Consumed by `mcpInstall/claude.ts` to seed `permissions.allow` so users
 * are not prompted on every fmark MCP call. Use this as the single source
 * of truth - adding a new tool requires adding its name here too.
 */
export const FMARK_MCP_TOOL_NAMES = [
  "fmark_list_sessions",
  "fmark_create_session",
  "fmark_rename_session",
  "fmark_fork_session",
  "fmark_list_participants",
  "fmark_register_agent",
  "fmark_link_agent",
  "fmark_read_events",
  "fmark_read_event",
  "fmark_get_todos",
  "fmark_get_inbox",
  "fmark_get_theme",
  "fmark_mark_seen",
  "fmark_post_prose",
  "fmark_post_todo",
  "fmark_post_tool_use",
  "fmark_post_choices",
  "fmark_post_choice",
  "fmark_post_alternatives",
  "fmark_post_flow",
  "fmark_post_html",
  "fmark_post_file_ref",
  "fmark_end_turn",
] as const;

export const FMARK_CLAUDE_ALLOW_ENTRIES = FMARK_MCP_TOOL_NAMES.map(
  (name) => `mcp__fmark__${name}`,
);

export function registerFmarkMcpTools(
  server: McpServer,
  options: FmarkMcpServerOptions = {},
): void {
  registerSessionTools(server, options);
  registerParticipantTools(server, options);
  registerResourceTools(server, options);
  registerControlTools(server, options);
  registerWriteEventTools(server, options);
}

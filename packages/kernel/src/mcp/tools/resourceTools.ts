import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FmarkMcpServerOptions } from "../server.js";
import { registerEventResourceTools } from "./resourceTools/eventTools.js";
import { registerThemeResourceTool } from "./resourceTools/themeTool.js";
import { registerTodoInboxResourceTools } from "./resourceTools/todoInboxTools.js";

export function registerResourceTools(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerEventResourceTools({ server, options });
  registerTodoInboxResourceTools({ server, options });
  registerThemeResourceTool({ server, options });
}

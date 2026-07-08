import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FmarkMcpServerOptions } from "../../server.js";

export interface ResourceToolRegistration {
  server: McpServer;
  options: FmarkMcpServerOptions;
}

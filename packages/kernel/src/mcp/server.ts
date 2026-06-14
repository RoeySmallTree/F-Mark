import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ResolveContextOptions } from "./context.js";
import { registerFmarkMcpResources } from "./resources.js";
import { registerFmarkMcpTools } from "./tools.js";

export interface FmarkMcpServerOptions extends ResolveContextOptions {
  includeProcessSpawningTools?: boolean;
}

export function createFmarkMcpServer(
  options: FmarkMcpServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: "f-mark",
    version: "0.4.0",
  });
  registerFmarkMcpTools(server, options);
  registerFmarkMcpResources(server, options);
  return server;
}

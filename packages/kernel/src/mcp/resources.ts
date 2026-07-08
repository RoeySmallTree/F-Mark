import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ResolveContextOptions } from "./context.js";
import { registerGuideResource } from "./resources/guideResource.js";
import { registerInboxResource } from "./resources/inboxResource.js";
import { registerProjectResources } from "./resources/projectResources.js";
import { registerSessionResources } from "./resources/sessionResources.js";
import { registerThemeResource } from "./resources/themeResource.js";

export function registerFmarkMcpResources(
  server: McpServer,
  options: ResolveContextOptions = {},
): void {
  registerGuideResource(server, options);
  registerThemeResource(server, options);
  registerProjectResources(server, options);
  registerSessionResources(server, options);
  registerInboxResource(server, options);
}

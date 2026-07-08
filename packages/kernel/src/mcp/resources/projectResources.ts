import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fmarkFetch,
  resolveFmarkMcpContext,
  type ResolveContextOptions,
} from "../context.js";
import { jsonContent } from "./content.js";

export function registerProjectResources(
  server: McpServer,
  options: ResolveContextOptions,
): void {
  registerProjectJsonResource(server, options, {
    name: "fmark-sessions",
    uri: "fmark://sessions",
    title: "F-Mark Sessions",
    description: "Sessions in the active F-Mark project.",
    path: "/sessions",
  });

  registerProjectJsonResource(server, options, {
    name: "fmark-participants",
    uri: "fmark://participants",
    title: "F-Mark Participants",
    description: "Participants in the active F-Mark project.",
    path: "/participants",
  });
}

function registerProjectJsonResource(
  server: McpServer,
  options: ResolveContextOptions,
  resource: {
    name: string;
    uri: string;
    title: string;
    description: string;
    path: string;
  },
): void {
  server.registerResource(
    resource.name,
    resource.uri,
    {
      title: resource.title,
      description: resource.description,
      mimeType: "application/json",
    },
    async () => {
      const ctx = await resolveFmarkMcpContext(options);
      return jsonContent(resource.uri, await fmarkFetch(ctx, resource.path));
    },
  );
}

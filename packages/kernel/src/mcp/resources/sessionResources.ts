import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fmarkFetch,
  resolveSessionContext,
  scopeForContext,
  type ResolveContextOptions,
} from "../context.js";
import { jsonContent } from "./content.js";

export function registerSessionResources(
  server: McpServer,
  options: ResolveContextOptions,
): void {
  registerSessionJsonResource(server, options, {
    name: "fmark-events",
    uri: "fmark://events",
    title: "F-Mark Events",
    description: "Events in the active F-Mark session.",
    path: (sessionId) =>
      `/sessions/${encodeURIComponent(sessionId)}/events`,
    // Agents read whole messages, not streamed fragments.
    query: { visible: "true" },
  });

  registerSessionJsonResource(server, options, {
    name: "fmark-todos",
    uri: "fmark://todos",
    title: "F-Mark Todos",
    description: "Todos in the active F-Mark session.",
    path: (sessionId) =>
      `/sessions/${encodeURIComponent(sessionId)}/todos`,
  });
}

function registerSessionJsonResource(
  server: McpServer,
  options: ResolveContextOptions,
  resource: {
    name: string;
    uri: string;
    title: string;
    description: string;
    path(sessionId: string): string;
    query?: Record<string, string>;
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
      const ctx = await resolveSessionContext(
        { participant_id: (options.env ?? process.env).F_MARK_AGENT_ID },
        options,
      );
      const qs = new URLSearchParams(scopeForContext(ctx));
      for (const [key, value] of Object.entries(resource.query ?? {})) {
        qs.set(key, value);
      }
      return jsonContent(
        resource.uri,
        await fmarkFetch(ctx, `${resource.path(ctx.sessionId)}?${qs.toString()}`),
      );
    },
  );
}

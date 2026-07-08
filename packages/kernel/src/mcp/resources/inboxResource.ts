import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fmarkFetch,
  resolveWriteContext,
  scopeForContext,
  type ResolveContextOptions,
} from "../context.js";
import { jsonContent } from "./content.js";

export function registerInboxResource(
  server: McpServer,
  options: ResolveContextOptions,
): void {
  server.registerResource(
    "fmark-inbox",
    "fmark://inbox",
    {
      title: "F-Mark Inbox",
      description: "Unread F-Mark activity for the active participant and session.",
      mimeType: "application/json",
    },
    async () => {
      const ctx = await resolveWriteContext(
        { participant_id: (options.env ?? process.env).F_MARK_AGENT_ID },
        options,
      );
      const qs = new URLSearchParams();
      qs.set("participant_id", ctx.participantId);
      qs.set("root", scopeForContext(ctx).root);
      const inbox = await fmarkFetch(
        ctx,
        `/sessions/${encodeURIComponent(ctx.sessionId)}/inbox?${qs.toString()}`,
      );
      return jsonContent("fmark://inbox", inbox);
    },
  );
}

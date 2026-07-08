import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fmarkFetch,
  resolveWriteContext,
  scopeForContext,
} from "../context.js";
import type { FmarkMcpServerOptions } from "../server.js";
import { baseContextSchema } from "./schemas.js";
import {
  compactBody,
  idempotentMutationToolAnnotations,
  textResult,
} from "./shared.js";

export function registerControlTools(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  server.registerTool(
    "fmark_mark_seen",
    {
      title: "Mark F-Mark Inbox Seen",
      description: "Advance this participant's inbox cursor for a session.",
      inputSchema: {
        ...baseContextSchema,
        timestamp: z.string().optional(),
      },
      annotations: idempotentMutationToolAnnotations,
    },
    async ({ session_id, participant_id, timestamp }) => {
      const ctx = await resolveWriteContext(
        { session_id, participant_id },
        options,
      );
      return textResult(
        await fmarkFetch(
          ctx,
          `/sessions/${encodeURIComponent(ctx.sessionId)}/mark-seen`,
          {
            method: "POST",
            body: JSON.stringify(
              compactBody({
                participant_id: ctx.participantId,
                timestamp,
                ...scopeForContext(ctx),
              }),
            ),
          },
        ),
      );
    },
  );
}

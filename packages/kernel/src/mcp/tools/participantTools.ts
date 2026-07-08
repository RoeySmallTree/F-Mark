import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fmarkFetch,
  resolveFmarkMcpContext,
  scopeForContext,
} from "../context.js";
import type { FmarkMcpServerOptions } from "../server.js";
import {
  compactBody,
  mutatingToolAnnotations,
  readOnlyToolAnnotations,
  textResult,
} from "./shared.js";

export function registerParticipantTools(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  server.registerTool(
    "fmark_list_participants",
    {
      title: "List F-Mark Participants",
      description: "List participants in the active F-Mark project.",
      inputSchema: {},
      annotations: readOnlyToolAnnotations,
    },
    async () => {
      const ctx = await resolveFmarkMcpContext(options);
      const qs = new URLSearchParams(scopeForContext(ctx));
      return textResult(await fmarkFetch(ctx, `/participants?${qs.toString()}`));
    },
  );

  server.registerTool(
    "fmark_register_agent",
    {
      title: "Register F-Mark Agent",
      description: "Register an agent participant.",
      inputSchema: {
        name: z.string(),
        suggested_id: z.string().optional(),
      },
      annotations: mutatingToolAnnotations,
    },
    async ({ name, suggested_id }) => {
      const ctx = await resolveFmarkMcpContext(options);
      const qs = new URLSearchParams(scopeForContext(ctx));
      return textResult(
        await fmarkFetch(ctx, `/participants/register?${qs.toString()}`, {
          method: "POST",
          body: JSON.stringify(
            compactBody({ kind: "agent", name, suggested_id }),
          ),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_link_agent",
    {
      title: "Link F-Mark Agent",
      description: "Link an agent participant to a session.",
      inputSchema: {
        participant_id: z.string(),
        session_id: z.string(),
      },
      annotations: mutatingToolAnnotations,
    },
    async ({ participant_id, session_id }) => {
      const ctx = await resolveFmarkMcpContext(options);
      return textResult(
        await fmarkFetch(
          ctx,
          `/agents/${encodeURIComponent(participant_id)}/link`,
          {
            method: "POST",
            body: JSON.stringify({ session_id, ...scopeForContext(ctx) }),
          },
        ),
      );
    },
  );
}

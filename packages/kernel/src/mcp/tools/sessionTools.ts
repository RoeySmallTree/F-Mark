import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fmarkFetch,
  resolveFmarkMcpContext,
  resolveSessionContext,
  scopeForContext,
} from "../context.js";
import type { FmarkMcpServerOptions } from "../server.js";
import { optionalRef } from "./schemas.js";
import {
  compactBody,
  mutatingToolAnnotations,
  readOnlyToolAnnotations,
  textResult,
} from "./shared.js";

export function registerSessionTools(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  server.registerTool(
    "fmark_list_sessions",
    {
      title: "List F-Mark Sessions",
      description: "List F-Mark sessions in the active project.",
      inputSchema: { scope: z.enum(["active", "all"]).optional() },
      annotations: readOnlyToolAnnotations,
    },
    async ({ scope }) => {
      const ctx = await resolveFmarkMcpContext(options);
      const qs =
        scope === "all"
          ? "?scope=all"
          : `?${new URLSearchParams(scopeForContext(ctx)).toString()}`;
      return textResult(await fmarkFetch(ctx, `/sessions${qs}`));
    },
  );

  server.registerTool(
    "fmark_create_session",
    {
      title: "Create F-Mark Session",
      description: "Create a F-Mark session in the active project.",
      inputSchema: { slug: z.string().optional() },
      annotations: mutatingToolAnnotations,
    },
    async ({ slug }) => {
      const ctx = await resolveFmarkMcpContext(options);
      return textResult(
        await fmarkFetch(ctx, "/sessions", {
          method: "POST",
          body: JSON.stringify(compactBody({ slug, path: ctx.projectRoot })),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_rename_session",
    {
      title: "Rename F-Mark Session",
      description:
        "Rename a F-Mark session (kebab-case slug). Sessions start with a placeholder name (`new-session`); as soon as you know what the session is about, call this with a short descriptive slug. Omit session_id to rename your own active session. The session id is immutable: renaming only changes the display name, so keep using the same session_id.",
      inputSchema: {
        slug: z.string(),
        session_id: optionalRef(),
        participant_id: optionalRef(),
      },
      annotations: mutatingToolAnnotations,
    },
    async ({ slug, session_id, participant_id }) => {
      const ctx = await resolveSessionContext(
        { session_id, participant_id },
        options,
      );
      return textResult(
        await fmarkFetch(
          ctx,
          `/sessions/${encodeURIComponent(ctx.sessionId)}`,
          {
            method: "PATCH",
            body: JSON.stringify(
              compactBody({ slug, ...scopeForContext(ctx) }),
            ),
          },
        ),
      );
    },
  );

  if (options.includeProcessSpawningTools !== false) {
    server.registerTool(
      "fmark_fork_session",
      {
        title: "Fork F-Mark Session",
        description:
          "Copy a F-Mark session and rebind active managed agents to the fork.",
        inputSchema: {
          session_id: z.string(),
          name: optionalRef(),
          path: z.string().optional(),
          relaunch_agents: z.boolean().optional(),
          agent_ids: z.array(z.string()).optional(),
        },
        annotations: mutatingToolAnnotations,
      },
      async ({ session_id, name, path, relaunch_agents, agent_ids }) => {
        const ctx = await resolveFmarkMcpContext(options);
        return textResult(
          await fmarkFetch(
            ctx,
            `/sessions/${encodeURIComponent(session_id)}/fork`,
            {
              method: "POST",
              body: JSON.stringify(
                compactBody({
                  name,
                  path,
                  ...scopeForContext(ctx),
                  relaunch_agents,
                  agent_ids,
                }),
              ),
            },
          ),
        );
      },
    );
  }
}

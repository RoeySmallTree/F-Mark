import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fmarkFetch,
  resolveFmarkMcpContext,
  resolveSessionContext,
  resolveWriteContext,
  type ResolveContextOptions,
} from "./context.js";

async function guideQuery(options: ResolveContextOptions): Promise<string> {
  const base = await resolveFmarkMcpContext(options);
  const qs = new URLSearchParams();
  try {
    const session = await resolveSessionContext(
      { participant_id: base.env.F_MARK_AGENT_ID },
      options,
    );
    qs.set("session_id", session.sessionId);
  } catch {
    if (
      base.env.F_MARK_SESSION_ID !== undefined &&
      base.env.F_MARK_SESSION_ID.length > 0
    ) {
      qs.set("session_id", base.env.F_MARK_SESSION_ID);
    }
  }
  if (base.env.F_MARK_AGENT_ID !== undefined && base.env.F_MARK_AGENT_ID.length > 0) {
    qs.set("agent_id", base.env.F_MARK_AGENT_ID);
  }
  if (base.env.F_MARK_RUNTIME_ID !== undefined && base.env.F_MARK_RUNTIME_ID.length > 0) {
    qs.set("runtime_id", base.env.F_MARK_RUNTIME_ID);
  }
  return qs.size > 0 ? `?${qs.toString()}` : "";
}

export function registerFmarkMcpResources(
  server: McpServer,
  options: ResolveContextOptions = {},
): void {
  server.registerResource(
    "fmark-guide",
    "fmark://guide",
    {
      title: "F-Mark Guide",
      description: "Live F-Mark guide for the active project.",
      mimeType: "text/markdown",
    },
    async () => {
      const ctx = await resolveFmarkMcpContext(options);
      const guide = await fmarkFetch(ctx, `/guide${await guideQuery(options)}`);
      return {
        contents: [
          {
            uri: "fmark://guide",
            text: typeof guide === "string" ? guide : JSON.stringify(guide, null, 2),
            mimeType: "text/markdown",
          },
        ],
      };
    },
  );

  server.registerResource(
    "fmark-sessions",
    "fmark://sessions",
    {
      title: "F-Mark Sessions",
      description: "Sessions in the active F-Mark project.",
      mimeType: "application/json",
    },
    async () => {
      const ctx = await resolveFmarkMcpContext(options);
      const sessions = await fmarkFetch(ctx, "/sessions");
      return {
        contents: [
          {
            uri: "fmark://sessions",
            text: JSON.stringify(sessions, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  server.registerResource(
    "fmark-participants",
    "fmark://participants",
    {
      title: "F-Mark Participants",
      description: "Participants in the active F-Mark project.",
      mimeType: "application/json",
    },
    async () => {
      const ctx = await resolveFmarkMcpContext(options);
      const participants = await fmarkFetch(ctx, "/participants");
      return {
        contents: [
          {
            uri: "fmark://participants",
            text: JSON.stringify(participants, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  server.registerResource(
    "fmark-events",
    "fmark://events",
    {
      title: "F-Mark Events",
      description: "Events in the active F-Mark session.",
      mimeType: "application/json",
    },
    async () => {
      const ctx = await resolveSessionContext(
        { participant_id: (options.env ?? process.env).F_MARK_AGENT_ID },
        options,
      );
      const events = await fmarkFetch(
        ctx,
        `/sessions/${encodeURIComponent(ctx.sessionId)}/events`,
      );
      return {
        contents: [
          {
            uri: "fmark://events",
            text: JSON.stringify(events, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

  server.registerResource(
    "fmark-todos",
    "fmark://todos",
    {
      title: "F-Mark Todos",
      description: "Todos in the active F-Mark session.",
      mimeType: "application/json",
    },
    async () => {
      const ctx = await resolveSessionContext(
        { participant_id: (options.env ?? process.env).F_MARK_AGENT_ID },
        options,
      );
      const todos = await fmarkFetch(
        ctx,
        `/sessions/${encodeURIComponent(ctx.sessionId)}/todos`,
      );
      return {
        contents: [
          {
            uri: "fmark://todos",
            text: JSON.stringify(todos, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );

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
      const inbox = await fmarkFetch(
        ctx,
        `/sessions/${encodeURIComponent(ctx.sessionId)}/inbox?${qs.toString()}`,
      );
      return {
        contents: [
          {
            uri: "fmark://inbox",
            text: JSON.stringify(inbox, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    },
  );
}

import { z } from "zod";
import {
  fmarkFetch,
  resolveSessionContext,
  resolveWriteContext,
  scopeForContext,
} from "../../context.js";
import { baseContextSchema } from "../schemas.js";
import {
  readOnlyToolAnnotations,
  textResult,
} from "../shared.js";
import type { ResourceToolRegistration } from "./types.js";

export function registerTodoInboxResourceTools({
  server,
  options,
}: ResourceToolRegistration): void {
  server.registerTool(
    "fmark_get_todos",
    {
      title: "Get F-Mark Todos",
      description: "Read visible todos from a F-Mark session.",
      inputSchema: {
        ...baseContextSchema,
        assigned_to: z.string().optional(),
        viewer: z.string().optional(),
      },
      annotations: readOnlyToolAnnotations,
    },
    async ({ session_id, participant_id, assigned_to, viewer }) => {
      const ctx = await resolveSessionContext(
        { session_id, participant_id },
        options,
      );
      return textResult(
        await fmarkFetch(
          ctx,
          todosPath(ctx.sessionId, scopeForContext(ctx).root, {
            assigned_to,
            viewer,
          }),
        ),
      );
    },
  );

  server.registerTool(
    "fmark_get_inbox",
    {
      title: "Get F-Mark Inbox",
      description:
        "Read unread session activity for this participant. A later fmark_end_turn acknowledges the work.",
      inputSchema: {
        ...baseContextSchema,
        limit: z.number().int().positive().max(100).optional(),
      },
      annotations: readOnlyToolAnnotations,
    },
    async ({ session_id, participant_id, limit }) => {
      const ctx = await resolveWriteContext(
        { session_id, participant_id },
        options,
      );
      return textResult(
        await fmarkFetch(
          ctx,
          inboxPath(ctx.sessionId, {
            participantId: ctx.participantId,
            root: scopeForContext(ctx).root,
            limit,
          }),
        ),
      );
    },
  );
}

function todosPath(
  sessionId: string,
  root: string,
  input: { assigned_to?: string; viewer?: string },
): string {
  const qs = new URLSearchParams();
  qs.set("root", root);
  if (input.assigned_to !== undefined) qs.set("assigned_to", input.assigned_to);
  if (input.viewer !== undefined) qs.set("viewer", input.viewer);
  return `/sessions/${encodeURIComponent(sessionId)}/todos?${qs.toString()}`;
}

function inboxPath(
  sessionId: string,
  input: { participantId: string; root: string; limit?: number },
): string {
  const qs = new URLSearchParams();
  qs.set("participant_id", input.participantId);
  qs.set("root", input.root);
  if (input.limit !== undefined) qs.set("limit", String(input.limit));
  return `/sessions/${encodeURIComponent(sessionId)}/inbox?${qs.toString()}`;
}

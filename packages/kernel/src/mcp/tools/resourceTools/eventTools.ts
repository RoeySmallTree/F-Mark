import { z } from "zod";
import {
  fmarkFetch,
  resolveSessionContext,
  scopeForContext,
} from "../../context.js";
import { baseContextSchema } from "../schemas.js";
import { readOnlyToolAnnotations, textResult } from "../shared.js";
import type { ResourceToolRegistration } from "./types.js";

export function registerEventResourceTools({
  server,
  options,
}: ResourceToolRegistration): void {
  server.registerTool(
    "fmark_read_events",
    {
      title: "Read F-Mark Events",
      description: "Read events from the active or specified F-Mark session.",
      inputSchema: {
        ...baseContextSchema,
        since: z.string().optional(),
        kinds: z.array(z.string()).optional(),
        participant: z.string().optional(),
      },
      annotations: readOnlyToolAnnotations,
    },
    async (input) => {
      const ctx = await resolveSessionContext(input, options);
      return textResult(
        await fmarkFetch(
          ctx,
          readEventsPath(ctx.sessionId, scopeForContext(ctx).root, input),
        ),
      );
    },
  );

  server.registerTool(
    "fmark_read_event",
    {
      title: "Read F-Mark Event",
      description: "Read one raw event file from a F-Mark session.",
      inputSchema: {
        ...baseContextSchema,
        filename: z.string(),
      },
      annotations: readOnlyToolAnnotations,
    },
    async ({ session_id, participant_id, filename }) => {
      const ctx = await resolveSessionContext(
        { session_id, participant_id },
        options,
      );
      const qs = new URLSearchParams(scopeForContext(ctx));
      return textResult(
        await fmarkFetch(
          ctx,
          `/sessions/${encodeURIComponent(ctx.sessionId)}/raw/${encodeURIComponent(filename)}?${qs.toString()}`,
        ),
      );
    },
  );
}

function readEventsPath(
  sessionId: string,
  root: string,
  input: {
    since?: string;
    kinds?: string[];
    participant?: string;
  },
): string {
  const qs = new URLSearchParams();
  qs.set("root", root);
  // Agents read whole messages, not streamed fragments: hide superseded events.
  qs.set("visible", "true");
  if (input.since !== undefined) qs.set("since", input.since);
  if (input.kinds !== undefined && input.kinds.length > 0) {
    qs.set("kinds", input.kinds.join(","));
  }
  if (input.participant !== undefined) qs.set("participant", input.participant);
  return `/sessions/${encodeURIComponent(sessionId)}/events?${qs.toString()}`;
}

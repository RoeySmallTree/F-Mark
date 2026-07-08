import type {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ShapeOutput,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import {
  fmarkFetch,
  resolveWriteContext,
  scopeForContext,
} from "../context.js";
import type { FmarkMcpServerOptions } from "../server.js";
import {
  compactBody,
  mutatingToolAnnotations,
  textResult,
} from "./shared.js";

type ToolInputSchema = ZodRawShapeCompat;
type InputFromSchema<Schema extends ToolInputSchema> = ShapeOutput<Schema>;

interface WriteEventToolDefinition<Schema extends ToolInputSchema> {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  eventPath: string;
  scopePosition?: "beforeBody" | "afterBody";
  body: (input: InputFromSchema<Schema>) => Record<string, unknown>;
}

export function registerWriteEventTool<Schema extends ToolInputSchema>(
  server: McpServer,
  options: FmarkMcpServerOptions,
  definition: WriteEventToolDefinition<Schema>,
): void {
  const handler: ToolCallback<ToolInputSchema> = async (input) => {
    const typedInput = input as InputFromSchema<Schema> & {
      session_id?: string;
      participant_id?: string;
    };
    const ctx = await resolveWriteContext(typedInput, options);
    const payload = definition.body(typedInput);
    const scope = scopeForContext(ctx);
    const scopedPayload =
      definition.scopePosition === "afterBody"
        ? { participant_id: ctx.participantId, ...payload, ...scope }
        : { participant_id: ctx.participantId, ...scope, ...payload };
    return textResult(
      await fmarkFetch(
        ctx,
        `/sessions/${encodeURIComponent(ctx.sessionId)}/events/${definition.eventPath}`,
        {
          method: "POST",
          body: JSON.stringify(
            /* Required root scope for event writes; event-specific fields
               such as file refs' `path` remain normal payload fields. */
            compactBody(scopedPayload),
          ),
        },
      ),
    );
  };

  server.registerTool<ToolInputSchema, ToolInputSchema>(
    definition.name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: mutatingToolAnnotations,
    },
    handler,
  );
}

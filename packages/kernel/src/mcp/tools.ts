import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fmarkFetch,
  resolveFmarkMcpContext,
  resolveSessionContext,
  resolveWriteContext,
} from "./context.js";
import type { FmarkMcpServerOptions } from "./server.js";

/**
 * Optional string param that treats "" / whitespace-only as ABSENT.
 *
 * Some MCP clients (notably opencode) populate every declared optional
 * parameter with an empty string rather than omitting it. Forwarding
 * `append_to: ""` (etc.) to the kernel routes trips their non-empty
 * validation, so an opencode agent's first `fmark_post_prose("Connected…")`
 * would fail. Use this for ref/name-style optionals (append_to, supersedes,
 * in_reply_to, name) — NOT for `content`, where an empty string is a
 * meaningful header-only anchor.
 */
export const optionalRef = (): z.ZodType<string | undefined> =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  );

/**
 * Canonical list of F-Mark MCP tool names, kept in sync with the
 * `server.registerTool(name, ...)` calls in `registerFmarkMcpTools` below.
 * Consumed by `mcpInstall/claude.ts` to seed `permissions.allow` so users
 * are not prompted on every fmark MCP call. Use this as the single source
 * of truth — adding a new tool requires adding its name here too.
 */
export const FMARK_MCP_TOOL_NAMES = [
  "fmark_list_sessions",
  "fmark_create_session",
  "fmark_fork_session",
  "fmark_list_participants",
  "fmark_register_agent",
  "fmark_link_agent",
  "fmark_read_events",
  "fmark_read_event",
  "fmark_get_todos",
  "fmark_get_inbox",
  "fmark_mark_seen",
  "fmark_post_prose",
  "fmark_post_todo",
  "fmark_post_tool_use",
  "fmark_post_choices",
  "fmark_post_choice",
  "fmark_post_alternatives",
  "fmark_post_flow",
  "fmark_post_html",
  "fmark_post_file_ref",
  "fmark_end_turn",
] as const;

export const FMARK_CLAUDE_ALLOW_ENTRIES = FMARK_MCP_TOOL_NAMES.map(
  (name) => `mcp__fmark__${name}`,
);

const baseContextSchema = {
  session_id: z.string().optional(),
  participant_id: z.string().optional(),
};

function textResult(value: unknown): {
  content: { type: "text"; text: string }[];
} {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function compactBody(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

export function registerFmarkMcpTools(
  server: McpServer,
  options: FmarkMcpServerOptions = {},
): void {
  server.registerTool(
    "fmark_list_sessions",
    {
      title: "List F-Mark Sessions",
      description: "List F-Mark sessions in the active project.",
      inputSchema: { scope: z.enum(["active", "all"]).optional() },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ scope }) => {
      const ctx = await resolveFmarkMcpContext(options);
      const qs = scope === "all" ? "?scope=all" : "";
      return textResult(await fmarkFetch(ctx, `/sessions${qs}`));
    },
  );

  server.registerTool(
    "fmark_create_session",
    {
      title: "Create F-Mark Session",
      description: "Create a F-Mark session in the active project.",
      inputSchema: { slug: z.string().optional() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ slug }) => {
      const ctx = await resolveFmarkMcpContext(options);
      return textResult(
        await fmarkFetch(ctx, "/sessions", {
          method: "POST",
          body: JSON.stringify(compactBody({ slug })),
        }),
      );
    },
  );

  if (options.includeProcessSpawningTools !== false) {
    server.registerTool(
      "fmark_fork_session",
      {
        title: "Fork F-Mark Session",
        description: "Copy a F-Mark session and rebind active managed agents to the fork.",
        inputSchema: {
          session_id: z.string(),
          name: optionalRef(),
          path: z.string().optional(),
          relaunch_agents: z.boolean().optional(),
          agent_ids: z.array(z.string()).optional(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
        },
      },
      async ({ session_id, name, path, relaunch_agents, agent_ids }) => {
        const ctx = await resolveFmarkMcpContext(options);
        return textResult(
          await fmarkFetch(ctx, `/sessions/${encodeURIComponent(session_id)}/fork`, {
            method: "POST",
            body: JSON.stringify(
              compactBody({ name, path, relaunch_agents, agent_ids }),
            ),
          }),
        );
      },
    );
  }

  server.registerTool(
    "fmark_list_participants",
    {
      title: "List F-Mark Participants",
      description: "List participants in the active F-Mark project.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      const ctx = await resolveFmarkMcpContext(options);
      return textResult(await fmarkFetch(ctx, "/participants"));
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ name, suggested_id }) => {
      const ctx = await resolveFmarkMcpContext(options);
      return textResult(
        await fmarkFetch(ctx, "/participants/register", {
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ participant_id, session_id }) => {
      const ctx = await resolveFmarkMcpContext(options);
      return textResult(
        await fmarkFetch(ctx, `/agents/${encodeURIComponent(participant_id)}/link`, {
          method: "POST",
          body: JSON.stringify({ session_id }),
        }),
      );
    },
  );

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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ session_id, participant_id, since, kinds, participant }) => {
      const ctx = await resolveSessionContext(
        { session_id, participant_id },
        options,
      );
      const qs = new URLSearchParams();
      if (since !== undefined) qs.set("since", since);
      if (kinds !== undefined && kinds.length > 0) qs.set("kinds", kinds.join(","));
      if (participant !== undefined) qs.set("participant", participant);
      const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events${suffix}`),
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ session_id, participant_id, filename }) => {
      const ctx = await resolveSessionContext(
        { session_id, participant_id },
        options,
      );
      return textResult(
        await fmarkFetch(
          ctx,
          `/sessions/${encodeURIComponent(ctx.sessionId)}/raw/${encodeURIComponent(filename)}`,
        ),
      );
    },
  );

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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ session_id, participant_id, assigned_to, viewer }) => {
      const ctx = await resolveSessionContext(
        { session_id, participant_id },
        options,
      );
      const qs = new URLSearchParams();
      if (assigned_to !== undefined) qs.set("assigned_to", assigned_to);
      if (viewer !== undefined) qs.set("viewer", viewer);
      const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/todos${suffix}`),
      );
    },
  );

  server.registerTool(
    "fmark_get_inbox",
    {
      title: "Get F-Mark Inbox",
      description: "Read unread session activity for this participant and mark returned items seen.",
      inputSchema: {
        ...baseContextSchema,
        limit: z.number().int().positive().max(100).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ session_id, participant_id, limit }) => {
      const ctx = await resolveWriteContext(
        { session_id, participant_id },
        options,
      );
      const qs = new URLSearchParams();
      qs.set("participant_id", ctx.participantId);
      if (limit !== undefined) qs.set("limit", String(limit));
      return textResult(
        await fmarkFetch(
          ctx,
          `/sessions/${encodeURIComponent(ctx.sessionId)}/inbox?${qs.toString()}`,
        ),
      );
    },
  );

  server.registerTool(
    "fmark_mark_seen",
    {
      title: "Mark F-Mark Inbox Seen",
      description: "Advance this participant's inbox cursor for a session.",
      inputSchema: {
        ...baseContextSchema,
        timestamp: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ session_id, participant_id, timestamp }) => {
      const ctx = await resolveWriteContext(
        { session_id, participant_id },
        options,
      );
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/mark-seen`, {
          method: "POST",
          body: JSON.stringify(
            compactBody({
              participant_id: ctx.participantId,
              timestamp,
            }),
          ),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_post_prose",
    {
      title: "Post F-Mark Prose",
      description: "Write a prose, comment, reply, revision, or anchor event to F-Mark.",
      inputSchema: {
        ...baseContextSchema,
        content: z.string(),
        name: optionalRef(),
        append_to: optionalRef(),
        mode: z.enum(["content", "comment"]).optional(),
        lines: z.array(z.number().int()).length(2).optional(),
        removed: z.boolean().optional(),
        file_path: z.string().optional(),
        diff_hunk: z.string().optional(),
        diff_base: z.string().optional(),
        line_context: z
          .object({
            selected: z.string(),
            before: z.string().optional(),
            after: z.string().optional(),
            sha256: z.string(),
          })
          .optional(),
        in_reply_to: optionalRef(),
        supersedes: optionalRef(),
        mentions: z
          .array(
            z.object({
              participant_id: z.string(),
              display_name: z.string(),
              token: z.string(),
            }),
          )
          .optional(),
        arbitrary: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/prose`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            content: input.content,
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.append_to !== undefined ? { append_to: input.append_to } : {}),
            ...(input.mode !== undefined ? { mode: input.mode } : {}),
            ...(input.lines !== undefined ? { lines: input.lines } : {}),
            ...(input.removed !== undefined ? { removed: input.removed } : {}),
            ...(input.file_path !== undefined ? { file_path: input.file_path } : {}),
            ...(input.diff_hunk !== undefined ? { diff_hunk: input.diff_hunk } : {}),
            ...(input.diff_base !== undefined ? { diff_base: input.diff_base } : {}),
            ...(input.line_context !== undefined ? { line_context: input.line_context } : {}),
            ...(input.in_reply_to !== undefined ? { in_reply_to: input.in_reply_to } : {}),
            ...(input.supersedes !== undefined ? { supersedes: input.supersedes } : {}),
            ...(input.mentions !== undefined ? { mentions: input.mentions } : {}),
            ...(input.arbitrary !== undefined ? { arbitrary: input.arbitrary } : {}),
            source: "mcp",
            path: ctx.projectRoot,
          }),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_post_todo",
    {
      title: "Post F-Mark Todo",
      description: "Create, update, or remove a F-Mark todo event.",
      inputSchema: {
        ...baseContextSchema,
        id: z.string(),
        title: z.string(),
        status: z.enum(["open", "wip", "done", "removed"]),
        body: z.string().optional(),
        assigned_to: z.string().optional(),
        parent_id: z.string().optional(),
        supersedes: optionalRef(),
        append_to: optionalRef(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/todo`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            ...compactBody({
              id: input.id,
              title: input.title,
              status: input.status,
              body: input.body,
              assigned_to: input.assigned_to,
              parent_id: input.parent_id,
              supersedes: input.supersedes,
              append_to: input.append_to,
            }),
          }),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_post_tool_use",
    {
      title: "Post F-Mark Tool Use",
      description: "Write a tool-use event to F-Mark.",
      inputSchema: {
        ...baseContextSchema,
        tool_name: z.string(),
        tool_use_id: z.string(),
        input: z.record(z.string(), z.unknown()),
        result: z.unknown().optional(),
        success: z.boolean(),
        duration_ms: z.number().optional(),
        append_to: optionalRef(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/tool-use`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            ...compactBody({
              tool_name: input.tool_name,
              tool_use_id: input.tool_use_id,
              input: input.input,
              result: input.result,
              success: input.success,
              duration_ms: input.duration_ms,
              append_to: input.append_to,
            }),
          }),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_post_choices",
    {
      title: "Post F-Mark Choices",
      description: "Write a choices prompt event to F-Mark.",
      inputSchema: {
        ...baseContextSchema,
        id: z.string(),
        question: z.string(),
        options: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            html: optionalRef(),
          }),
        ),
        multi: z.boolean(),
        supersedes: optionalRef(),
        append_to: optionalRef(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/choices`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            ...compactBody({
              id: input.id,
              question: input.question,
              options: input.options,
              multi: input.multi,
              supersedes: input.supersedes,
              append_to: input.append_to,
            }),
          }),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_post_choice",
    {
      title: "Post F-Mark Choice",
      description: "Write a selected choice event to F-Mark.",
      inputSchema: {
        ...baseContextSchema,
        choices_id: z.string(),
        selected: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/choice`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            choices_id: input.choices_id,
            selected: input.selected,
          }),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_post_alternatives",
    {
      title: "Post F-Mark Alternatives",
      description:
        "Create multiple HTML alternatives as one visual multi-option widget. Writes one HTML bundle per option, then a single choices event that renders the options as selectable HTML previews (with fullscreen view). Use when generating several HTML mockups/designs to compare and choose between in one turn. The user picks via fmark_post_choice.",
      inputSchema: {
        ...baseContextSchema,
        id: z.string(),
        question: z.string(),
        options: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            html: z.string(),
            css: z.string().optional(),
            js: z.string().optional(),
            title: z.string().optional(),
            dependencies: z.array(z.string()).optional(),
          }),
        ),
        multi: z.boolean(),
        supersedes: optionalRef(),
        append_to: optionalRef(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(
          ctx,
          `/sessions/${encodeURIComponent(ctx.sessionId)}/events/alternatives`,
          {
            method: "POST",
            body: JSON.stringify({
              participant_id: ctx.participantId,
              ...compactBody({
                id: input.id,
                question: input.question,
                options: input.options,
                multi: input.multi,
                supersedes: input.supersedes,
                append_to: input.append_to,
              }),
            }),
          },
        ),
      );
    },
  );

  server.registerTool(
    "fmark_post_flow",
    {
      title: "Post F-Mark Flow",
      description: "Write a flow diagram event to F-Mark.",
      inputSchema: {
        ...baseContextSchema,
        id: z.string(),
        title: z.string().optional(),
        nodes: z.array(z.record(z.string(), z.unknown())),
        edges: z.array(z.record(z.string(), z.unknown())),
        supersedes: optionalRef(),
        append_to: optionalRef(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/flow`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            ...compactBody({
              id: input.id,
              title: input.title,
              nodes: input.nodes,
              edges: input.edges,
              supersedes: input.supersedes,
              append_to: input.append_to,
            }),
          }),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_post_html",
    {
      title: "Post F-Mark HTML",
      description: "Write an HTML bundle event to F-Mark.",
      inputSchema: {
        ...baseContextSchema,
        html: z.string(),
        css: z.string().optional(),
        js: z.string().optional(),
        title: z.string().optional(),
        dependencies: z.array(z.string()).optional(),
        supersedes: optionalRef(),
        append_to: optionalRef(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/html`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            ...compactBody({
              html: input.html,
              css: input.css,
              js: input.js,
              title: input.title,
              dependencies: input.dependencies,
              supersedes: input.supersedes,
              append_to: input.append_to,
            }),
          }),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_post_file_ref",
    {
      title: "Post F-Mark File Reference",
      description: "Write a file metadata reference event to F-Mark.",
      inputSchema: {
        ...baseContextSchema,
        id: z.string(),
        path: z.string(),
        mime_type: z.string(),
        description: z.string().optional(),
        append_to: optionalRef(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/file`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            ...compactBody({
              id: input.id,
              path: input.path,
              mime_type: input.mime_type,
              description: input.description,
              append_to: input.append_to,
            }),
          }),
        }),
      );
    },
  );

  server.registerTool(
    "fmark_end_turn",
    {
      title: "End F-Mark Turn",
      description: "Write a F-Mark turn-end event for the active or specified session.",
      inputSchema: baseContextSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await resolveWriteContext(input, options);
      return textResult(
        await fmarkFetch(ctx, `/sessions/${encodeURIComponent(ctx.sessionId)}/events/turn-end`, {
          method: "POST",
          body: JSON.stringify({
            participant_id: ctx.participantId,
            source: "mcp",
            path: ctx.projectRoot,
          }),
        }),
      );
    },
  );
}

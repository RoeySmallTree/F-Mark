import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FmarkMcpServerOptions } from "../server.js";
import { baseContextSchema, optionalRef } from "./schemas.js";
import { registerWriteEventTool } from "./writeEventTools.js";

export function registerWriteEventTools(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerProseTool(server, options);
  registerTodoTool(server, options);
  registerToolUseTool(server, options);
  registerChoiceTools(server, options);
  registerAlternativesTool(server, options);
  registerFlowTool(server, options);
  registerHtmlTool(server, options);
  registerFileRefTool(server, options);
  registerTurnEndTool(server, options);
}

function registerProseTool(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_post_prose",
    title: "Post F-Mark Prose",
    description:
      "Write prose to F-Mark: a chat message, a named document anchor, a document block, a comment, a reply, or a revision. A chat message (no name, no append_to) is for at most 3 short sentences of dialogue/status — anything longer belongs in a named document (set name to open a header-only anchor, then append_to blocks onto it). Open a NEW named anchor for each new deliverable; append_to only extends the document you are currently building — never a prior finished document, and never whatever anchor happened to be open from an earlier turn. Revise by re-posting with supersedes:<old filename> and the same append_to; never post a 'v2' as a new block. Link participants with the mentions array (each {participant_id, display_name, token}, where token is the literal @handle substring in content). Example: {content:'Parser shipped.'} for a status line; {name:'Refactor plan', content:''} to open a document. Avoid: dumping a multi-paragraph answer as a nameless chat message. Omit participant_id/session_id to use your launch-packet defaults.",
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
    eventPath: "prose",
    scopePosition: "afterBody",
    body: (input) => ({
      content: input.content,
      name: input.name,
      append_to: input.append_to,
      mode: input.mode,
      lines: input.lines,
      removed: input.removed,
      file_path: input.file_path,
      diff_hunk: input.diff_hunk,
      diff_base: input.diff_base,
      line_context: input.line_context,
      in_reply_to: input.in_reply_to,
      supersedes: input.supersedes,
      mentions: input.mentions,
      arbitrary: input.arbitrary,
      source: "mcp",
    }),
  });
}

function registerTodoTool(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_post_todo",
    title: "Post F-Mark Todo",
    description:
      "Create, update, or remove a F-Mark todo — visible task/plan state the user watches in the feed. Before multi-step work, post the plan as todos, then move each open → wip → done by re-posting with the same id and supersedes:<latest filename>. Prefer this over a private/internal task list. Example: post {id:'t1', title:'Wire route', status:'open'}, later supersede to status:'wip' then 'done'. Avoid: doing multi-step work silently and only reporting at the end. Omit participant_id/session_id to use your launch-packet defaults.",
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
    eventPath: "todo",
    body: (input) => ({
      id: input.id,
      title: input.title,
      status: input.status,
      body: input.body,
      assigned_to: input.assigned_to,
      parent_id: input.parent_id,
      supersedes: input.supersedes,
      append_to: input.append_to,
    }),
  });
}

function registerToolUseTool(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_post_tool_use",
    title: "Post F-Mark Tool Use",
    description:
      "Write a tool-use panel event to F-Mark. Post one BEFORE a slow shell command, search, or background agent so the user can watch it run — the panel IS the record; don't reconstruct a summary from memory afterward. Carries {tool_name, tool_use_id, input, result?, success, duration_ms?}. Example: surface a long test run as a tool_use panel, then supersede it with the result. Avoid: posting the panel only AFTER the command finished — post it before, so progress is visible. Omit participant_id/session_id to use your launch-packet defaults.",
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
    eventPath: "tool-use",
    body: (input) => ({
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
      input: input.input,
      result: input.result,
      success: input.success,
      duration_ms: input.duration_ms,
      append_to: input.append_to,
    }),
  });
}

function registerChoiceTools(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_post_choices",
    title: "Post F-Mark Choices",
    description:
      "Write a choices prompt event to F-Mark (plain-text options; for visual/HTML options use fmark_post_alternatives). Set multi:false only when the user should pick exactly one option; set multi:true when the user may pick any number. If your question contains 'or more', 'combine', 'mix', 'select all', or any other multi-select cue, either set multi:true or rewrite the question as single-select — the server rejects mismatches. Reuse the same id with supersedes to revise in place; a fresh id creates a duplicate widget. Example: {question:'Which auth approach?', options:[{id:'jwt',label:'JWT'},{id:'session',label:'Sessions'}], multi:false}. Avoid: duplicate option ids, or multi:false when the question invites combining. Omit participant_id/session_id to use your launch-packet defaults.",
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
      multi: z
        .boolean()
        .describe(
          "false = pick exactly one option; true = pick any number of options. If the question says 'or more', 'mix', 'combine', or 'select all', use true.",
        ),
      supersedes: optionalRef(),
      append_to: optionalRef(),
    },
    eventPath: "choices",
    body: (input) => ({
      id: input.id,
      question: input.question,
      options: input.options,
      multi: input.multi,
      supersedes: input.supersedes,
      append_to: input.append_to,
    }),
  });

  registerWriteEventTool(server, options, {
    name: "fmark_post_choice",
    title: "Post F-Mark Choice",
    description:
      "Write a selected-choice event to F-Mark — records which option(s) the user picked on a choices/alternatives widget. Example: {choices_id:'ch_approach', selected:['jwt']}. Avoid: inventing a choices_id that no widget used. Omit participant_id/session_id to use your launch-packet defaults.",
    inputSchema: {
      ...baseContextSchema,
      choices_id: z.string(),
      selected: z.array(z.string()),
    },
    eventPath: "choice",
    body: (input) => ({
      choices_id: input.choices_id,
      selected: input.selected,
    }),
  });
}

function registerAlternativesTool(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_post_alternatives",
    title: "Post F-Mark Alternatives",
    description:
      "Create multiple HTML alternatives as one visual multi-option widget. Writes one HTML bundle per option, then a single choices event rendering the options as selectable previews (with fullscreen view). Use when generating several HTML mockups/designs to compare and choose between in one turn. Required: id, question, options, and multi (all four). If your question contains 'or more', 'combine', 'mix', 'select all', or any other multi-select cue, either set multi:true or rewrite the question as single-select — the server rejects mismatches. Set multi:false only when the user should pick exactly one; the user picks via fmark_post_choice. Reuse the same id with supersedes to revise in place; a fresh id creates a duplicate widget. The posting surface is not the design target — first state the visual target for every option: (1) target-repo-ui → match that repo/product's own design system (read its source first), not F-Mark's applied theme; (2) fmark-ui → read the real renderer source under packages/renderer/src and reuse its classes, resolving colors via fmark_get_theme; (3) session-artifact → default to the Amber house theme (fmark_get_theme with theme:\"amber\"). Example: three dashboard-card layouts for the chat, multi:false, all session-artifact (Amber). Avoid: a multi:false question whose text says 'pick one or combine'. Omit participant_id/session_id to use your launch-packet defaults.",
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
      multi: z
        .boolean()
        .describe(
          "false = pick exactly one option; true = pick any number of options. If the question says 'or more', 'mix', 'combine', or 'select all', use true.",
        ),
      supersedes: optionalRef(),
      append_to: optionalRef(),
    },
    eventPath: "alternatives",
    body: (input) => ({
      id: input.id,
      question: input.question,
      options: input.options,
      multi: input.multi,
      supersedes: input.supersedes,
      append_to: input.append_to,
    }),
  });
}

function registerFlowTool(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_post_flow",
    title: "Post F-Mark Flow",
    description:
      "Write a flow diagram event to F-Mark — an interactive graph, never ASCII/box-art. Reach for this any time your answer would otherwise contain 'flow', 'pipeline', 'then', 'step 1 / step 2', 'if X → Y', or 'depends on', or any bulleted list whose bullets have a logical order: bullets flatten structure, a flow keeps it. Omit position on nodes for auto-layout (all-or-nothing). Reuse the same id with supersedes to revise in place; a fresh id creates a duplicate graph. Example: 'the release pipeline is build → test → deploy' → a 3-node flow. Avoid: describing a state machine as a markdown list. Omit participant_id/session_id to use your launch-packet defaults.",
    inputSchema: {
      ...baseContextSchema,
      id: z.string(),
      title: z.string().optional(),
      nodes: z.array(z.record(z.string(), z.unknown())),
      edges: z.array(z.record(z.string(), z.unknown())),
      supersedes: optionalRef(),
      append_to: optionalRef(),
    },
    eventPath: "flow",
    body: (input) => ({
      id: input.id,
      title: input.title,
      nodes: input.nodes,
      edges: input.edges,
      supersedes: input.supersedes,
      append_to: input.append_to,
    }),
  });
}

function registerHtmlTool(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_post_html",
    title: "Post F-Mark HTML",
    description:
      "Write an HTML bundle event to F-Mark (a sandboxed html+css+js preview). The posting surface is NOT the design target — F-Mark is only the delivery surface. First state the visual target and design authority in one sentence: (1) target-repo-ui — UI for a specific repo or product (the current project OR another product) → read THAT repo's own styles/components/tokens first and match them; do NOT use F-Mark's applied theme as the palette; (2) fmark-ui — UI that ships in F-Mark itself → read the real renderer source under packages/renderer/src first, reuse its class names/structure, and resolve colors via fmark_get_theme tokens; (3) session-artifact — an unbound chart, analysis, or standalone visual → default to the Amber house theme (fmark_get_theme with theme:\"amber\") regardless of the applied theme. Revise in place by passing supersedes:<old html filename> (same append_to). Omit participant_id/session_id to use your launch-packet defaults. Example: a revenue chart for the chat is session-artifact (fmark_get_theme theme:\"amber\"). Avoid: painting a target-repo-ui mockup with F-Mark's applied theme just because it posts through F-Mark.",
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
    eventPath: "html",
    body: (input) => ({
      html: input.html,
      css: input.css,
      js: input.js,
      title: input.title,
      dependencies: input.dependencies,
      supersedes: input.supersedes,
      append_to: input.append_to,
    }),
  });
}

function registerFileRefTool(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_post_file_ref",
    title: "Post F-Mark File Reference",
    description:
      "Write a file-reference event to F-Mark — cite a repo file (and line) as a first-class event instead of pasting a path into prose. Carries {id, path, mime_type, description?}. Example: reference packages/renderer/src/shell/shell.css when discussing a style. Avoid: pasting a bare file path into a prose message when the reference belongs in its own event. Omit participant_id/session_id to use your launch-packet defaults.",
    inputSchema: {
      ...baseContextSchema,
      id: z.string(),
      path: z.string(),
      mime_type: z.string(),
      description: z.string().optional(),
      append_to: optionalRef(),
    },
    eventPath: "file",
    body: (input) => ({
      id: input.id,
      path: input.path,
      mime_type: input.mime_type,
      description: input.description,
      append_to: input.append_to,
    }),
  });
}

function registerTurnEndTool(
  server: McpServer,
  options: FmarkMcpServerOptions,
): void {
  registerWriteEventTool(server, options, {
    name: "fmark_end_turn",
    title: "End F-Mark Turn",
    description:
      "Write a F-Mark turn-end event, marking your turn complete — the last call of every turn. Example: call with no arguments to end your turn in the active session. Avoid: printing more commentary after this; it never reaches the session. Omit participant_id/session_id to use your launch-packet defaults.",
    inputSchema: baseContextSchema,
    eventPath: "turn-end",
    scopePosition: "afterBody",
    body: () => ({
      source: "mcp",
    }),
  });
}

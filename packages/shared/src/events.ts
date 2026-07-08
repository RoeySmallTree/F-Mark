export type EventKind =
  | "prose"
  | "choices"
  | "choice"
  | "turn-end"
  | "todo"
  | "html"
  | "file"
  | "tool-use"
  | "subagent-run"
  | "subagent-output"
  | "access-request"
  | "access-response"
  | "flow"
  | "fork-link";

export const EVENT_KINDS = {
  prose: "prose",
  choices: "choices",
  choice: "choice",
  turnEnd: "turn-end",
  todo: "todo",
  html: "html",
  file: "file",
  toolUse: "tool-use",
  subagentRun: "subagent-run",
  subagentOutput: "subagent-output",
  accessRequest: "access-request",
  accessResponse: "access-response",
  flow: "flow",
  forkLink: "fork-link",
} as const satisfies Record<string, EventKind>;

/** Diff mode a file/hunk comment was made against — the UI mode names, plus an
 *  optional resolved base commit sha string. */
export type DiffBase =
  | "working"
  | "current-session"
  | "whole-branch"
  | (string & {});

export const DIFF_BASES = {
  working: "working",
  currentSession: "current-session",
  wholeBranch: "whole-branch",
} as const satisfies Record<string, DiffBase>;

/** Fuzzy re-anchor context for a file comment so its line range can be
 *  recovered after the file is edited (line-drift repair). */
export interface LineContext {
  selected: string;
  before?: string;
  after?: string;
  sha256: string;
}

export interface ProseMention {
  participant_id: string;
  display_name: string;
  token: string;
}

/**
 * Role an event plays inside a parent. Only meaningful when `append_to` is
 * set on a prose payload — non-prose embeds are always "content".
 */
export type BlockMode = "content" | "comment";
export type EventSourceKind = "mcp" | "hook" | "manual";

export interface ProseFrontmatter {
  /** Anchor-document name OR named sub-section name. */
  name?: string;
  /** Filename of the parent event (anchor prose, or another block).
   *  When set, this event is composed inside its parent, not at the
   *  top level. */
  append_to?: string;
  /** Role inside the parent: "content" (default when append_to is set)
   *  for a block of the doc; "comment" for a line/card-targeted comment.
   *  Ignored when `append_to` is unset. */
  mode?: BlockMode;
  /** Inclusive 1-based line range inside the parent's rendered content.
   *  Valid only when `mode === "comment"` AND the parent is a prose-like
   *  rendered-text target. */
  lines?: [number, number];
  /** Generic tombstone. A prose event with `removed: true` and
   *  `supersedes: <X>` marks the chain at X as dead regardless of X's
   *  kind — flow / file / html / etc. */
  removed?: boolean;
  /** Project-root-relative path of the file this prose comments on. Set ONLY
   *  for file/diff comments; mutually exclusive with `append_to`/`mode`. The
   *  presence of `file_path` makes this a `file-comment` role. */
  file_path?: string;
  /** The unified-diff hunk text a diff comment targets (stable display). */
  diff_hunk?: string;
  /** Which diff mode/base the file comment was made against. */
  diff_base?: DiffBase;
  /** Fuzzy re-anchor context for line-drift repair. */
  line_context?: LineContext;
  in_reply_to?: string;
  /** Filename(s) this prose supersedes. A scalar marks one revision dead;
   *  an array lets one coalesced assistant message hide all the streamed
   *  delta files it replaces (written in run order). */
  supersedes?: string | string[];
  mentions?: ProseMention[];
  source?: EventSourceKind;
  /**
   * When true, marks the prose as mid-turn / non-deliberate output streamed by a hook.
   * The renderer groups consecutive `arbitrary: true` events into a collapsible box.
   * Omitted from frontmatter when undefined or false.
   */
  arbitrary?: boolean;
}

export interface ProsePayload extends ProseFrontmatter {
  content: string;
}

export interface ChoicesOption {
  id: string;
  label: string;
  /** Bare html-event bundle filename (e.g. `20260613T120000.001Z_ag.html`),
   *  served at /sessions/{id}/raw/{html}/index.html. Set when the option is a
   *  visual alternative rather than a plain text choice. NOT the manifest id. */
  html?: string;
}

export interface ChoicesPayload {
  id: string;
  question: string;
  options: ChoicesOption[];
  multi: boolean;
  supersedes?: string;
  /** Parent event filename. When set, this choices block is embedded
   *  inside an anchor prose document rather than shown standalone. */
  append_to?: string;
}

export interface ChoiceCustomOption {
  id: string;
  label: string;
}

export interface ChoicePayload {
  choices_id: string;
  selected: string[];
  /** User-authored options added from a multi-select widget. The ids are
   *  included in `selected`; labels carry the free-text answer. */
  custom_options?: ChoiceCustomOption[];
}

export interface TurnEndPayload {
  participant_id: string;
  source?: EventSourceKind;
}

export type TodoStatus = "open" | "done" | "wip" | "removed";
export type TodoTreeStatus = Exclude<TodoStatus, "removed">;

export const TODO_STATUSES = {
  open: "open",
  done: "done",
  wip: "wip",
  removed: "removed",
} as const satisfies Record<string, TodoStatus>;

export interface TodoPayload {
  id: string;
  title: string;
  body?: string;
  status: TodoStatus;
  assigned_to?: string;
  parent_id?: string;
  supersedes?: string;
  /** Parent event filename. When set, this todo is embedded inside an
   *  anchor prose document rather than shown standalone. */
  append_to?: string;
}

export interface TodoTreeNode {
  id: string;
  title: string;
  body?: string;
  status: TodoTreeStatus;
  assigned_to?: string;
  parent_id?: string;
  children: TodoTreeNode[];
}

export type FilePreviewKind =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "pdf"
  | "csv"
  | "docx"
  | "xlsx"
  | "pptx"
  | "file";

export const FILE_PREVIEW_KINDS = {
  image: "image",
  video: "video",
  audio: "audio",
  text: "text",
  pdf: "pdf",
  csv: "csv",
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
  file: "file",
} as const satisfies Record<string, FilePreviewKind>;

export interface FileRefPayload {
  schema?: "fmark.file.v1";
  id: string;
  display_name?: string;
  path: string;
  mime_type: string;
  size_bytes?: number;
  preview_kind?: FilePreviewKind;
  description?: string;
  supersedes?: string;
  /** Parent event filename. When set, this file is embedded inside an
   *  anchor prose document rather than shown standalone. */
  append_to?: string;
}

export interface EventRecord<T = unknown> {
  filename: string;
  timestamp: string;
  participant_id: string;
  kind: EventKind;
  payload: T;
}

export interface ProseEventRecord extends EventRecord<ProsePayload> {
  kind: "prose";
}

export interface ChoicesEventRecord extends EventRecord<ChoicesPayload> {
  kind: "choices";
}

export interface ChoiceEventRecord extends EventRecord<ChoicePayload> {
  kind: "choice";
}

export interface TurnEndEventRecord extends EventRecord<TurnEndPayload> {
  kind: "turn-end";
}

export interface TodoEventRecord extends EventRecord<TodoPayload> {
  kind: "todo";
}

export interface FileEventRecord extends EventRecord<FileRefPayload> {
  kind: "file";
}

export interface HtmlManifest {
  id: string;
  title?: string;
  dependencies?: string[];
  /** Parent event filename. When set, this html widget is embedded
   *  inside an anchor prose document rather than shown standalone. */
  append_to?: string;
}

export interface HtmlEventRecord extends EventRecord<HtmlManifest> {
  kind: "html";
}

export interface ToolUsePayload {
  tool_name: string;
  tool_use_id: string;
  input: unknown;
  result?: unknown;
  success: boolean;
  duration_ms?: number;
  /** Parent event filename. When set, this tool-use panel is embedded
   *  inside an anchor prose document rather than shown standalone. */
  append_to?: string;
}

export interface ToolUseEventRecord extends EventRecord<ToolUsePayload> {
  kind: "tool-use";
}

export type SubagentStatus =
  | "started"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export type SubagentSource =
  | "hook"
  | "transcript"
  | "terminal-stream"
  | "mcp-middleware"
  | "unknown";

export type SubagentSourceConfidence = "high" | "medium" | "low";

export interface SubagentRunPayload {
  schema: "fmark.subagent-run.v1";
  parent_participant_id: string;
  parent_runtime_id: string | null;
  parent_runtime_session_id?: string;
  parent_turn_id?: string;
  parent_tool_use_id?: string;
  subagent_id: string;
  name: string;
  role?: string;
  prompt_preview?: string;
  status: SubagentStatus;
  started_at?: string;
  ended_at?: string;
  transcript_path?: string;
  correlation_id: string;
  sequence: number;
  source: SubagentSource;
  source_confidence: SubagentSourceConfidence;
  raw?: unknown;
  /** Parent event filename. When set, this sub-agent run is embedded
   *  inside an anchor prose document rather than shown standalone. */
  append_to?: string;
}

export interface SubagentOutputPayload {
  schema: "fmark.subagent-output.v1";
  parent_participant_id: string;
  parent_runtime_id: string | null;
  parent_runtime_session_id?: string;
  parent_turn_id?: string;
  parent_tool_use_id?: string;
  subagent_id: string;
  name?: string;
  content: string;
  arbitrary?: boolean;
  status?: SubagentStatus;
  correlation_id: string;
  sequence: number;
  source: SubagentSource;
  source_confidence: SubagentSourceConfidence;
  raw?: unknown;
  /** Parent event filename. When set, this sub-agent output is embedded
   *  inside an anchor prose document rather than shown standalone. */
  append_to?: string;
}

export interface SubagentRunEventRecord
  extends EventRecord<SubagentRunPayload> {
  kind: "subagent-run";
}

export interface SubagentOutputEventRecord
  extends EventRecord<SubagentOutputPayload> {
  kind: "subagent-output";
}

export type AccessRequestStatus =
  | "open"
  | "approved"
  | "denied"
  | "resolved"
  | "expired"
  | "bridge-timeout";

export type AccessRequestType =
  | "permission"
  | "trust"
  | "config"
  | "tool"
  | "command"
  | "unknown";

export type AccessResponseChannel = "hook" | "terminal" | "none";

export interface AccessRequestSuggestion {
  id: string;
  label: string;
  decision: Extract<AccessResponseDecision, "approve" | "deny">;
  terminal_input?: string;
  scope?: "once" | "session" | "always" | "default";
  description?: string;
}

export interface AccessRequestPayload {
  schema: "fmark.access-request.v1";
  request_id: string;
  status: AccessRequestStatus;
  request_type: AccessRequestType;
  runtime_id: string | null;
  runtime_session_id?: string;
  runtime_turn_id?: string;
  hook_event_name: string;
  title: string;
  message?: string;
  tool_name?: string;
  tool_input?: unknown;
  command?: string;
  permission_mode?: string;
  suggestions?: AccessRequestSuggestion[];
  cwd?: string;
  transcript_path?: string;
  response_channel: AccessResponseChannel;
  raw?: unknown;
  created_at: string;
}

export type AccessResponseDecision =
  | "approve"
  | "deny"
  | "resolved"
  | "expired"
  | "bridge-timeout";

export interface AccessResponsePayload {
  schema: "fmark.access-response.v1";
  request_id: string;
  decision: AccessResponseDecision;
  status: Exclude<AccessRequestStatus, "open">;
  delivered: boolean;
  delivery: AccessResponseChannel;
  option_id?: string;
  terminal_input?: string;
  scope?: AccessRequestSuggestion["scope"];
  message?: string;
  error?: string;
  responded_at: string;
}

export interface AccessRequestEventRecord
  extends EventRecord<AccessRequestPayload> {
  kind: "access-request";
}

export interface AccessResponseEventRecord
  extends EventRecord<AccessResponsePayload> {
  kind: "access-response";
}

export type FlowItemType =
  | "default"
  | "info"
  | "success"
  | "danger"
  | "disabled";

export type FlowEdgeStyle = "solid" | "dashed" | "dotted" | "flowing";
export type FlowEdgeType = "default" | "info" | "success" | "danger";

export interface FlowNodePopover {
  html: string;
  css?: string;
  js?: string;
}

export interface FlowNode {
  id: string;
  label: string;
  title?: string;
  content?: string;
  popover?: FlowNodePopover;
  itemType?: FlowItemType;
  focused?: boolean;
  /** Optional explicit position. If omitted on ANY node, the renderer runs dagre. */
  position?: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: FlowEdgeStyle;
  /** Visual variant (CSS class). Not a React Flow routing type. */
  type?: FlowEdgeType;
}

export interface FlowPayload {
  /** Stable id used by `supersedes` for revisions. */
  id: string;
  title?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  supersedes?: string;
  /** Parent event filename. When set, this flow chart is embedded inside
   *  an anchor prose document rather than shown standalone. */
  append_to?: string;
}

export interface FlowEventRecord extends EventRecord<FlowPayload> {
  kind: "flow";
}

export interface ForkLinkPayload {
  schema: "fmark.fork-link.v1";
  direction: "from" | "to";
  other_session_id: string;
  other_session_slug: string;
  /** Reserved for cross-root forks. v1 always leaves this unset because the
   *  fork route's body.path selects the SOURCE root and the fork is allocated
   *  inside the same root. */
  other_path?: string;
}

export interface ForkLinkEventRecord extends EventRecord<ForkLinkPayload> {
  kind: "fork-link";
}

export type AnyEventRecord =
  | ProseEventRecord
  | ChoicesEventRecord
  | ChoiceEventRecord
  | TurnEndEventRecord
  | TodoEventRecord
  | FileEventRecord
  | HtmlEventRecord
  | ToolUseEventRecord
  | SubagentRunEventRecord
  | SubagentOutputEventRecord
  | AccessRequestEventRecord
  | AccessResponseEventRecord
  | FlowEventRecord
  | ForkLinkEventRecord
  | EventRecord;

export type EventKind =
  | "prose"
  | "choices"
  | "choice"
  | "turn-end"
  | "todo"
  | "html"
  | "file"
  | "tool-use"
  | "flow";

export interface ProseTarget {
  file: string;
  lines?: [number, number];
}

/**
 * Role an event plays inside a parent. Only meaningful when `append_to` is
 * set on a prose payload — non-prose embeds are always "content".
 */
export type BlockMode = "content" | "comment";

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
  /** @deprecated Use `append_to` + `mode: "comment"` + `lines`. Read by
   *  the parser for back-compat; serializer never emits it. */
  target?: ProseTarget;
  in_reply_to?: string;
  supersedes?: string;
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

export interface ChoicePayload {
  choices_id: string;
  selected: string[];
}

export interface TurnEndPayload {
  participant_id: string;
}

export interface TodoPayload {
  id: string;
  title: string;
  body?: string;
  status: "open" | "done" | "wip" | "removed";
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
  status: "open" | "done" | "wip";
  assigned_to?: string;
  parent_id?: string;
  children: TodoTreeNode[];
}

export type FilePreviewKind =
  | "image"
  | "text"
  | "pdf"
  | "csv"
  | "docx"
  | "xlsx"
  | "pptx"
  | "file";

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

export type AnyEventRecord =
  | ProseEventRecord
  | ChoicesEventRecord
  | ChoiceEventRecord
  | TurnEndEventRecord
  | TodoEventRecord
  | FileEventRecord
  | HtmlEventRecord
  | ToolUseEventRecord
  | FlowEventRecord
  | EventRecord;

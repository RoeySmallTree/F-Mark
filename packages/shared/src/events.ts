export type EventKind =
  | "prose"
  | "choices"
  | "choice"
  | "turn-end"
  | "todo"
  | "html"
  | "file"
  | "tool-use";

export interface ProseTarget {
  file: string;
  lines?: [number, number];
}

export interface ProseFrontmatter {
  name?: string;
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

export interface FileRefPayload {
  id: string;
  path: string;
  mime_type: string;
  description?: string;
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
}

export interface ToolUseEventRecord extends EventRecord<ToolUsePayload> {
  kind: "tool-use";
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
  | EventRecord;

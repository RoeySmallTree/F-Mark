import type {
  AccessRequestPayload,
  AccessResponseDecision,
  AccessResponsePayload,
  ChoiceCustomOption,
  ChoicesOption,
  DiffBase,
  EventKind,
  EventSourceKind,
  FilePreviewKind,
  FileRefPayload,
  FlowEdge,
  FlowNode,
  LineContext,
  ProseMention,
  SubagentOutputPayload,
  SubagentRunPayload,
  TodoPayload,
  TodoTreeNode,
} from "./events.js";

export interface EventWriteResponse<K extends EventKind = EventKind> {
  filename: string;
  timestamp?: string;
  participant_id?: string;
  kind?: K;
}

export interface PostProseBody {
  participant_id: string;
  content: string;
  name?: string;
  append_to?: string;
  mode?: "content" | "comment";
  lines?: [number, number];
  removed?: boolean;
  /** File/diff comment target — project-root-relative path. Mutually
   *  exclusive with `append_to`/`mode`. */
  file_path?: string;
  diff_hunk?: string;
  diff_base?: DiffBase;
  line_context?: LineContext;
  in_reply_to?: string;
  /** Filename(s) this prose supersedes — scalar for a revision, array for a
   *  coalesced message hiding its streamed delta files. */
  supersedes?: string | string[];
  /** Requested write timestamp. The coalescer stamps a coalesced message at
   *  its first delta's time so it keeps its place ahead of following tools in
   *  visible reads. The writer still collision-bumps as needed. */
  timestamp?: string;
  mentions?: ProseMention[];
  source?: EventSourceKind;
  arbitrary?: boolean;
}

export interface PostToolUseBody {
  participant_id: string;
  tool_name: string;
  tool_use_id: string;
  input: unknown;
  result?: unknown;
  success: boolean;
  duration_ms?: number;
  append_to?: string;
}

export interface PostSubagentRunBody extends SubagentRunPayload {
  participant_id: string;
}

export interface PostSubagentOutputBody extends SubagentOutputPayload {
  participant_id: string;
}

export interface PostAccessRequestBody extends AccessRequestPayload {
  participant_id: string;
}

export interface PostAccessResponseBody extends AccessResponsePayload {
  participant_id: string;
}

export interface ManagedAccessResponseRequest {
  session_id: string;
  participant_id: string;
  decision: Extract<AccessResponseDecision, "approve" | "deny">;
  option_id?: string;
  message?: string;
  path_id?: string;
  root?: string;
}

export interface ManagedAccessResponseResponse {
  ok: true;
  request_id: string;
  filename: string;
  delivered: boolean;
  status: AccessResponsePayload["status"];
  delivery: AccessResponsePayload["delivery"];
  error?: string;
}

export interface PostChoicesBody {
  participant_id: string;
  id: string;
  question: string;
  options: ChoicesOption[];
  multi: boolean;
  supersedes?: string;
  append_to?: string;
}

export interface PostChoiceBody {
  participant_id: string;
  choices_id: string;
  selected: string[];
  custom_options?: ChoiceCustomOption[];
}

export interface PostTurnEndBody {
  participant_id: string;
  source?: EventSourceKind;
}

export interface PostTodoBody {
  participant_id: string;
  id: string;
  title: string;
  body?: string;
  status: TodoPayload["status"];
  assigned_to?: string;
  parent_id?: string;
  supersedes?: string;
  append_to?: string;
}

export interface PostHtmlBody {
  participant_id: string;
  html: string;
  css?: string;
  js?: string;
  title?: string;
  dependencies?: string[];
  supersedes?: string;
  append_to?: string;
}

/** One visual alternative: an inline HTML bundle + its option metadata. The
 *  alternatives route writes each as a standalone `html` event, then links the
 *  generated bundle filenames into a single `choices` event's options. */
export interface PostAlternativesOption {
  id: string;
  label: string;
  html: string;
  css?: string;
  js?: string;
  title?: string;
  dependencies?: string[];
}

export interface PostAlternativesBody {
  participant_id: string;
  id: string;
  question: string;
  options: PostAlternativesOption[];
  multi: boolean;
  supersedes?: string;
  append_to?: string;
}

export interface PostAlternativesResponse extends EventWriteResponse<"choices"> {
  /** Map of option id → generated html bundle filename (the value written to
   *  the choices option's `html` ref). */
  html: Array<{ option_id: string; filename: string }>;
}

export interface PostFlowBody {
  participant_id: string;
  id: string;
  title?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  supersedes?: string;
  append_to?: string;
}

export interface PostFileBody {
  participant_id: string;
  id: string;
  path: string;
  mime_type: string;
  display_name?: string;
  size_bytes?: number;
  preview_kind?: FilePreviewKind;
  description?: string;
  append_to?: string;
}

export type VisibleTodoStatus = TodoTreeNode["status"];
export type TodoOwnership = "owned" | "NOT owned";

export interface TodoOwnershipAnnotation {
  owned_by_viewer?: boolean;
  ownership?: TodoOwnership;
}

export type AnnotatedTodoPayload = TodoPayload & TodoOwnershipAnnotation;

export type AnnotatedTodoTreeNode = Omit<TodoTreeNode, "children"> &
  TodoOwnershipAnnotation & {
    children: AnnotatedTodoTreeNode[];
  };

export type TodoBuckets = Record<VisibleTodoStatus, AnnotatedTodoPayload[]>;

export interface TodoListResponse extends TodoBuckets {
  tree: AnnotatedTodoTreeNode[];
  viewer?: string;
}

/** Response from POST /sessions/:id/attachments. The endpoint stages a file
 *  on disk; the renderer then commits a `file` event referencing this
 *  metadata via POST /sessions/:id/events/file. */
export interface UploadAttachmentResponse {
  id: string;
  display_name: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  preview_kind: FilePreviewKind;
}

export interface PostFileMetadata {
  id: string;
  display_name?: string;
  path: string;
  mime_type: string;
  size_bytes?: number;
  preview_kind?: FilePreviewKind;
  description?: string;
  supersedes?: string;
  append_to?: string;
}

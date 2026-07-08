import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AccessRequestPayload,
  AccessResponsePayload,
  AnnotatedTodoPayload,
  AnnotatedTodoTreeNode,
  ChoicesOption,
  EventKind,
  EventWriteResponse,
  FileRefPayload,
  FlowEdge,
  FlowNode,
  HtmlManifest,
  PostAlternativesBody,
  PostChoiceBody,
  PostAccessRequestBody,
  PostAccessResponseBody,
  PostChoicesBody,
  PostFileBody,
  PostFlowBody,
  PostHtmlBody,
  PostProseBody,
  PostSubagentOutputBody,
  PostSubagentRunBody,
  PostTodoBody,
  PostToolUseBody,
  PostTurnEndBody,
  ProsePayload,
  TodoBuckets,
  TodoEventRecord,
  TodoPayload,
  TodoTreeNode,
  VisibleTodoStatus,
} from "@f-mark/shared";
import { composeFilename, isoTimestamp } from "@f-mark/shared";
import { listParticipants } from "../participants.js";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { readEvents } from "../events/reader.js";
import { serializeProse } from "../events/prose.js";
import { serializeToolUse } from "../events/toolUse.js";
import { assembleHtmlBundleIndex } from "../events/htmlBundle.js";
import { assertWithinSession, bumpMillisecond } from "../events/sessionPath.js";
import {
  EVENT_FILENAME_RE,
  validateNonProseAppendTo,
  validateProseFrontmatter,
} from "../events/proseValidate.js";
import { writeEventFile } from "../events/writer.js";
import type { EventPublishRecord } from "./eventPublisher.js";

export interface ProseWriteBody extends PostProseBody {
  /** Hook envelope. Checked by REST routes before this service is called. */
  path?: string;
}

export type ToolUseWriteBody = PostToolUseBody & { path?: string };
export type SubagentRunWriteBody = PostSubagentRunBody & { path?: string };
export type SubagentOutputWriteBody = PostSubagentOutputBody & { path?: string };
export type TurnEndWriteBody = PostTurnEndBody & { path?: string };
export type AccessRequestWriteBody = PostAccessRequestBody & { path?: string };
export type AccessResponseWriteBody = PostAccessResponseBody & { path?: string };

export type EventWriteResult<K extends EventKind> =
  Required<EventWriteResponse<K>>;

export interface EventWriteOutcome<
  K extends EventKind,
  R extends EventWriteResult<K> = EventWriteResult<K>,
> {
  response: R;
  publish: EventPublishRecord<K>[];
}

export interface TodoListResponse extends TodoBuckets {
  tree: AnnotatedTodoTreeNode[];
  viewer?: string;
}

interface TodoSnapshotEntry {
  event: TodoEventRecord;
  payload: TodoPayload;
  createdAt: string;
}

interface TodoSnapshotState {
  latestById: Map<string, TodoEventRecord>;
  createdAtById: Map<string, string>;
}

interface HtmlBundleAllocation {
  folderName: string;
  folderPath: string;
}

const TODO_STATUS_RANK: Record<VisibleTodoStatus, number> = {
  wip: 0,
  open: 1,
  done: 2,
};

function writeResponse<K extends EventKind>(
  filename: string,
  participantId: string,
  kind: K,
): EventWriteResult<K> {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind,
  };
}

function outcome<K extends EventKind, R extends EventWriteResult<K>>(
  response: R,
  supersedes?: string | string[],
): EventWriteOutcome<K, R> {
  return {
    response,
    publish: [
      {
        filename: response.filename,
        kind: response.kind,
        participantId: response.participant_id,
        supersedes,
      },
    ],
  };
}

function assertValidation(
  validation: { ok: true } | { ok: false; error: string },
): void {
  if (!validation.ok) throw new Error(validation.error);
}

/* Root-scope fields (`root`, `path_id`, legacy hook `path`) are transport-only
   routing keys (expansion-decisions.md X2). They must never be persisted into
   durable event JSON. Serializers that spread the remainder of a request body
   (choices/choice/subagent/access/flow) strip them through this helper so the
   event schema stays clean. Explicit field-pick serializers (prose, tool-use,
   todo, html, file, turn-end, alternatives) are already safe. */
function stripScopeFields<T extends object>(
  body: T,
): Omit<T, "root" | "path_id" | "path"> {
  const {
    root: _root,
    path_id: _pathId,
    path: _path,
    ...rest
  } = body as T & { root?: unknown; path_id?: unknown; path?: unknown };
  return rest as Omit<T, "root" | "path_id" | "path">;
}

const PROSE_PAYLOAD_FIELDS = [
  "name",
  "append_to",
  "mode",
  "lines",
  "file_path",
  "diff_hunk",
  "diff_base",
  "line_context",
  "removed",
  "in_reply_to",
  "supersedes",
  "source",
  "arbitrary",
] as const;

type ProsePayloadField = (typeof PROSE_PAYLOAD_FIELDS)[number];

function assignProsePayloadField(
  payload: ProsePayload,
  body: ProseWriteBody,
  field: ProsePayloadField,
): void {
  const value = body[field];
  if (value === undefined) return;
  (payload as unknown as Record<string, unknown>)[field] = value;
}

function prosePayload(body: ProseWriteBody): ProsePayload {
  const payload: ProsePayload = { content: body.content };
  for (const field of PROSE_PAYLOAD_FIELDS) {
    assignProsePayloadField(payload, body, field);
  }
  if (body.mentions !== undefined && body.mentions.length > 0) {
    payload.mentions = body.mentions;
  }
  return payload;
}

export async function writeProseEvent(
  p: Paths,
  sessionId: string,
  input: ProseWriteBody,
): Promise<EventWriteOutcome<"prose">> {
  const body = input;
  assertValidation(
    validateProseFrontmatter({
      content: body.content,
      name: body.name,
      append_to: body.append_to,
      mode: body.mode,
      lines: body.lines,
      removed: body.removed,
      file_path: body.file_path,
    }),
  );
  const filename = await writeEventFile(p, sessionId, {
    participant_id: body.participant_id,
    kind: "prose",
    ext: "md",
    contents: serializeProse(prosePayload(body)),
    ...(body.timestamp !== undefined ? { timestamp: body.timestamp } : {}),
  });
  return outcome(writeResponse(filename, body.participant_id, "prose"), body.supersedes);
}

export async function writeToolUseEvent(
  p: Paths,
  sessionId: string,
  body: ToolUseWriteBody,
): Promise<EventWriteOutcome<"tool-use">> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  const filename = await writeEventFile(p, sessionId, {
    participant_id: body.participant_id,
    kind: "tool-use",
    ext: "json",
    contents: serializeToolUse({
      tool_name: body.tool_name,
      tool_use_id: body.tool_use_id,
      input: body.input,
      result: body.result,
      success: body.success,
      duration_ms: body.duration_ms,
      append_to: body.append_to,
    }),
  });
  return outcome(writeResponse(filename, body.participant_id, "tool-use"));
}

function subagentRunPayload(
  body: SubagentRunWriteBody,
): Omit<SubagentRunWriteBody, "participant_id" | "path"> {
  const { participant_id: _participantId, ...payload } = stripScopeFields(body);
  return payload;
}

function subagentOutputPayload(
  body: SubagentOutputWriteBody,
): Omit<SubagentOutputWriteBody, "participant_id" | "path"> {
  const { participant_id: _participantId, ...payload } = stripScopeFields(body);
  return payload;
}

export async function writeSubagentRunEvent(
  p: Paths,
  sessionId: string,
  body: SubagentRunWriteBody,
): Promise<EventWriteOutcome<"subagent-run">> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  const filename = await writeEventFile(p, sessionId, {
    participant_id: body.participant_id,
    kind: "subagent-run",
    ext: "json",
    contents: JSON.stringify(subagentRunPayload(body), null, 2),
  });
  return outcome(writeResponse(filename, body.participant_id, "subagent-run"));
}

export async function writeSubagentOutputEvent(
  p: Paths,
  sessionId: string,
  body: SubagentOutputWriteBody,
): Promise<EventWriteOutcome<"subagent-output">> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  const filename = await writeEventFile(p, sessionId, {
    participant_id: body.participant_id,
    kind: "subagent-output",
    ext: "json",
    contents: JSON.stringify(subagentOutputPayload(body), null, 2),
  });
  return outcome(writeResponse(filename, body.participant_id, "subagent-output"));
}

function accessRequestPayload(
  body: AccessRequestWriteBody,
): AccessRequestPayload {
  const { participant_id: _participantId, ...payload } = stripScopeFields(body);
  return payload;
}

function accessResponsePayload(
  body: AccessResponseWriteBody,
): AccessResponsePayload {
  const { participant_id: _participantId, ...payload } = stripScopeFields(body);
  return payload;
}

export async function writeAccessRequestEvent(
  p: Paths,
  sessionId: string,
  body: AccessRequestWriteBody,
): Promise<EventWriteOutcome<"access-request">> {
  const filename = await writeEventFile(p, sessionId, {
    participant_id: body.participant_id,
    kind: "access-request",
    ext: "json",
    contents: JSON.stringify(accessRequestPayload(body), null, 2),
  });
  return outcome(writeResponse(filename, body.participant_id, "access-request"));
}

export async function writeAccessResponseEvent(
  p: Paths,
  sessionId: string,
  body: AccessResponseWriteBody,
): Promise<EventWriteOutcome<"access-response">> {
  const filename = await writeEventFile(p, sessionId, {
    participant_id: body.participant_id,
    kind: "access-response",
    ext: "json",
    contents: JSON.stringify(accessResponsePayload(body), null, 2),
  });
  return outcome(writeResponse(filename, body.participant_id, "access-response"));
}

/* Validate any `option.html` references on a choices write. A ref is the bare
   filename of an existing html-event bundle in this session (not the manifest
   id). Reject empty strings, traversal, manifest ids, and dangling refs so a
   choices event can never point an option preview at a missing bundle. */
async function assertOptionHtmlRefs(
  p: Paths,
  sessionId: string,
  options: ChoicesOption[],
): Promise<void> {
  for (const o of options) {
    if (o.html === undefined) continue;
    if (typeof o.html !== "string" || o.html.length === 0) {
      throw new Error(`option ${o.id}: html ref must be a non-empty filename`);
    }
    if (!o.html.endsWith(".html") || !EVENT_FILENAME_RE.test(o.html)) {
      throw new Error(`option ${o.id}: invalid html ref "${o.html}"`);
    }
    const indexPath = join(p.sessionDir(sessionId), o.html, "index.html");
    assertWithinSession(p, sessionId, indexPath);
    try {
      if (!(await stat(indexPath)).isFile()) throw new Error("not a file");
    } catch {
      throw new Error(`option ${o.id}: html bundle not found: ${o.html}`);
    }
  }
}

const MULTI_SELECT_QUESTION_HINTS = [
  /\bor\s+more\b/i,
  /\bone\s+or\s+more\b/i,
  /\bany\s+number\b/i,
  /\bselect\s+all\b/i,
  /\bpick\s+(?:any|multiple|several)\b/i,
  /\bchoose\s+(?:any|multiple|several)\b/i,
  /\bselect\s+(?:any|multiple|several)\b/i,
  /\bmix(?:\s+and\s+match)?\b/i,
  /\bcombine\b/i,
] as const;

function questionImpliesMultipleSelections(question: string): boolean {
  return MULTI_SELECT_QUESTION_HINTS.some((pattern) => pattern.test(question));
}

function assertChoiceModeMatchesQuestion(
  body: Pick<PostChoicesBody, "question" | "multi">,
): void {
  if (body.multi || !questionImpliesMultipleSelections(body.question)) return;
  throw new Error(
    "choices question implies multiple selections, but multi is false; set multi: true or reword the question as single-select",
  );
}

export async function writeChoicesEvent(
  p: Paths,
  sessionId: string,
  body: PostChoicesBody,
): Promise<EventWriteOutcome<"choices">> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  assertChoiceModeMatchesQuestion(body);
  await assertOptionHtmlRefs(p, sessionId, body.options);
  const { participant_id, supersedes, ...rest } = stripScopeFields(body);
  const filename = await writeEventFile(p, sessionId, {
    participant_id,
    kind: "choices",
    ext: "json",
    contents: JSON.stringify(
      supersedes !== undefined ? { ...rest, supersedes } : rest,
      null,
      2,
    ),
  });
  return outcome(writeResponse(filename, participant_id, "choices"), supersedes);
}

export async function writeChoiceEvent(
  p: Paths,
  sessionId: string,
  body: PostChoiceBody,
): Promise<EventWriteOutcome<"choice">> {
  const { participant_id, ...rest } = stripScopeFields(body);
  const filename = await writeEventFile(p, sessionId, {
    participant_id,
    kind: "choice",
    ext: "json",
    contents: JSON.stringify(rest, null, 2),
  });
  return outcome(writeResponse(filename, participant_id, "choice"));
}

export async function writeTurnEndEvent(
  p: Paths,
  sessionId: string,
  body: TurnEndWriteBody,
): Promise<EventWriteOutcome<"turn-end">> {
  const filename = await writeEventFile(p, sessionId, {
    participant_id: body.participant_id,
    kind: "turn-end",
    ext: "json",
    contents: JSON.stringify(
      {
        participant_id: body.participant_id,
        ...(body.source !== undefined ? { source: body.source } : {}),
      },
      null,
      2,
    ),
  });
  return outcome(writeResponse(filename, body.participant_id, "turn-end"));
}

function isVisibleTodoStatus(
  status: TodoPayload["status"],
): status is VisibleTodoStatus {
  return status === "open" || status === "wip" || status === "done";
}

function createTodoBuckets(): TodoBuckets {
  return {
    open: [],
    wip: [],
    done: [],
  };
}

function matchesAssignedTo(payload: TodoPayload, assignedTo?: string): boolean {
  return (
    assignedTo === undefined ||
    assignedTo.length === 0 ||
    payload.assigned_to === assignedTo
  );
}

export function buildTodoSnapshot(
  todoEvents: TodoEventRecord[],
): TodoSnapshotEntry[] {
  const state = collectTodoSnapshotState(todoEvents);
  const superseded = collectSupersededTodoFilenames(todoEvents);
  return materializeTodoSnapshotEntries(state, superseded);
}

function collectTodoSnapshotState(todoEvents: TodoEventRecord[]): TodoSnapshotState {
  const state: TodoSnapshotState = {
    latestById: new Map<string, TodoEventRecord>(),
    createdAtById: new Map<string, string>(),
  };
  for (const event of todoEvents) {
    const id = event.payload.id;
    if (typeof id !== "string" || id.length === 0) continue;
    rememberTodoCreation(state, id, event.timestamp);
    rememberLatestTodoEvent(state, id, event);
  }
  return state;
}

function rememberTodoCreation(
  state: TodoSnapshotState,
  id: string,
  timestamp: string,
): void {
  const existingCreatedAt = state.createdAtById.get(id);
  if (existingCreatedAt === undefined || timestamp < existingCreatedAt) {
    state.createdAtById.set(id, timestamp);
  }
}

function rememberLatestTodoEvent(
  state: TodoSnapshotState,
  id: string,
  event: TodoEventRecord,
): void {
  const existing = state.latestById.get(id);
  if (existing === undefined || event.timestamp > existing.timestamp) {
    state.latestById.set(id, event);
  }
}

function collectSupersededTodoFilenames(
  todoEvents: TodoEventRecord[],
): Set<string> {
  const superseded = new Set<string>();
  for (const event of todoEvents) {
    const sup = event.payload.supersedes;
    if (typeof sup === "string" && sup.length > 0) superseded.add(sup);
  }
  return superseded;
}

function materializeTodoSnapshotEntries(
  state: TodoSnapshotState,
  superseded: Set<string>,
): TodoSnapshotEntry[] {
  const entries: TodoSnapshotEntry[] = [];
  for (const event of state.latestById.values()) {
    if (superseded.has(event.filename)) continue;
    const createdAt = state.createdAtById.get(event.payload.id);
    if (createdAt === undefined) continue;
    entries.push({ event, payload: event.payload, createdAt });
  }
  return entries;
}

function annotateOwnership<T extends TodoPayload | TodoTreeNode>(
  todo: T,
  viewer?: string,
): T & { owned_by_viewer?: boolean; ownership?: "owned" | "NOT owned" } {
  if (viewer === undefined || viewer.length === 0) return todo;
  const owned = todo.assigned_to === viewer;
  return {
    ...todo,
    owned_by_viewer: owned,
    ownership: owned ? "owned" : "NOT owned",
  };
}

function makeTreeNode(
  payload: TodoPayload,
  viewer?: string,
): AnnotatedTodoTreeNode {
  const node: AnnotatedTodoTreeNode = {
    id: payload.id,
    title: payload.title,
    status: payload.status as VisibleTodoStatus,
    children: [],
    ...(payload.body !== undefined ? { body: payload.body } : {}),
    ...(payload.assigned_to !== undefined
      ? { assigned_to: payload.assigned_to }
      : {}),
    ...(payload.parent_id !== undefined ? { parent_id: payload.parent_id } : {}),
  };
  return annotateOwnership(node, viewer);
}

function wouldCreateCycle(
  id: string,
  parentId: string,
  payloadById: Map<string, TodoPayload>,
): boolean {
  const seen = new Set<string>();
  let current: string | undefined = parentId;
  while (current !== undefined) {
    if (current === id) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = payloadById.get(current)?.parent_id;
  }
  return false;
}

function buildTodoTree(
  entries: TodoSnapshotEntry[],
  assignedTo?: string,
  viewer?: string,
): AnnotatedTodoTreeNode[] {
  const visibleEntries = entries.filter(
    (entry) =>
      isVisibleTodoStatus(entry.payload.status) &&
      matchesAssignedTo(entry.payload, assignedTo),
  );
  const nodeById = new Map<string, AnnotatedTodoTreeNode>();
  const payloadById = new Map<string, TodoPayload>();
  const createdAtById = new Map<string, string>();

  for (const entry of visibleEntries) {
    nodeById.set(entry.payload.id, makeTreeNode(entry.payload, viewer));
    payloadById.set(entry.payload.id, entry.payload);
    createdAtById.set(entry.payload.id, entry.createdAt);
  }

  const roots: AnnotatedTodoTreeNode[] = [];
  for (const entry of visibleEntries) {
    const node = nodeById.get(entry.payload.id);
    if (node === undefined) continue;

    const parentId = entry.payload.parent_id;
    const parent =
      parentId !== undefined &&
      !wouldCreateCycle(entry.payload.id, parentId, payloadById)
        ? nodeById.get(parentId)
        : undefined;

    if (parent === undefined) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  const compareByGroup = compareTodoNodesByGroup(createdAtById);
  const sortNodes = (nodes: AnnotatedTodoTreeNode[]): void => {
    nodes.sort(compareByGroup);
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}

function compareTodoNodesByGroup(
  createdAtById: Map<string, string>,
): (a: AnnotatedTodoTreeNode, b: AnnotatedTodoTreeNode) => number {
  return (a, b) =>
    compareTodoStatus(a, b) ||
    compareTodoAssignee(a, b) ||
    compareTodoCreatedAt(createdAtById, a, b) ||
    a.id.localeCompare(b.id);
}

function compareTodoStatus(
  a: AnnotatedTodoTreeNode,
  b: AnnotatedTodoTreeNode,
): number {
  return TODO_STATUS_RANK[a.status] - TODO_STATUS_RANK[b.status];
}

function compareTodoAssignee(
  a: AnnotatedTodoTreeNode,
  b: AnnotatedTodoTreeNode,
): number {
  return (a.assigned_to ?? "\uffff").localeCompare(b.assigned_to ?? "\uffff");
}

function compareTodoCreatedAt(
  createdAtById: Map<string, string>,
  a: AnnotatedTodoTreeNode,
  b: AnnotatedTodoTreeNode,
): number {
  return (createdAtById.get(a.id) ?? "").localeCompare(
    createdAtById.get(b.id) ?? "",
  );
}

export function buildTodoListResponse(
  entries: TodoSnapshotEntry[],
  assignedTo?: string,
  viewer?: string,
): TodoListResponse {
  const buckets = createTodoBuckets();

  const newestFirst = Array.from(entries).sort((a, b) =>
    b.event.timestamp.localeCompare(a.event.timestamp),
  );

  for (const entry of newestFirst) {
    const payload = entry.payload;
    if (!isVisibleTodoStatus(payload.status)) continue;
    if (!matchesAssignedTo(payload, assignedTo)) continue;
    buckets[payload.status].push(
      annotateOwnership(payload, viewer) as AnnotatedTodoPayload,
    );
  }

  const response: TodoListResponse = {
    ...buckets,
    tree: buildTodoTree(entries, assignedTo, viewer),
  };
  if (viewer !== undefined && viewer.length > 0) response.viewer = viewer;
  return response;
}

function findDescendants(
  entries: TodoSnapshotEntry[],
  parentId: string,
): TodoSnapshotEntry[] {
  const childrenByParent = new Map<string, TodoSnapshotEntry[]>();
  for (const entry of entries) {
    if (!isVisibleTodoStatus(entry.payload.status)) continue;
    const entryParentId = entry.payload.parent_id;
    if (entryParentId === undefined || entryParentId.length === 0) continue;
    const siblings = childrenByParent.get(entryParentId) ?? [];
    siblings.push(entry);
    childrenByParent.set(entryParentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        a.payload.id.localeCompare(b.payload.id),
    );
  }

  const descendants: TodoSnapshotEntry[] = [];
  const seen = new Set<string>([parentId]);
  const visit = (id: string): void => {
    const children = childrenByParent.get(id) ?? [];
    for (const child of children) {
      const childId = child.payload.id;
      if (seen.has(childId)) continue;
      seen.add(childId);
      descendants.push(child);
      visit(childId);
    }
  };
  visit(parentId);
  return descendants;
}

function buildTodoPayload(body: Omit<PostTodoBody, "participant_id">): TodoPayload {
  const payload: TodoPayload = {
    id: body.id,
    title: body.title,
    status: body.status,
  };
  if (body.body !== undefined) payload.body = body.body;
  if (body.assigned_to !== undefined) payload.assigned_to = body.assigned_to;
  if (body.parent_id !== undefined) payload.parent_id = body.parent_id;
  if (body.supersedes !== undefined) payload.supersedes = body.supersedes;
  if (body.append_to !== undefined) payload.append_to = body.append_to;
  return payload;
}

function buildRemovedPayload(entry: TodoSnapshotEntry): TodoPayload {
  const payload: TodoPayload = {
    id: entry.payload.id,
    title: entry.payload.title,
    status: "removed",
  };
  if (entry.payload.body !== undefined) payload.body = entry.payload.body;
  if (entry.payload.assigned_to !== undefined) {
    payload.assigned_to = entry.payload.assigned_to;
  }
  if (entry.payload.parent_id !== undefined) {
    payload.parent_id = entry.payload.parent_id;
  }
  payload.supersedes = entry.event.filename;
  return payload;
}

async function writeTodoPayload(
  p: Paths,
  sessionId: string,
  participantId: string,
  payload: TodoPayload,
): Promise<string> {
  return writeEventFile(p, sessionId, {
    participant_id: participantId,
    kind: "todo",
    ext: "json",
    contents: JSON.stringify(payload, null, 2),
  });
}

export async function writeTodoEvent(
  p: Paths,
  sessionId: string,
  body: PostTodoBody,
): Promise<EventWriteOutcome<"todo">> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  const { participant_id, ...rest } = body;
  const payload = buildTodoPayload(rest);
  let cascadedRemovals: TodoSnapshotEntry[] = [];
  if (payload.status === "removed") {
    const events = await readEvents(p, sessionId, { kinds: ["todo"] });
    const todoEvents = events.filter(
      (e): e is TodoEventRecord => e.kind === "todo",
    );
    cascadedRemovals = findDescendants(buildTodoSnapshot(todoEvents), payload.id);
  }

  const filename = await writeTodoPayload(p, sessionId, participant_id, payload);
  const response = writeResponse(filename, participant_id, "todo");
  const publish: EventPublishRecord<"todo">[] = [
    {
      filename,
      kind: "todo",
      participantId: participant_id,
      supersedes: rest.supersedes,
    },
  ];

  for (const entry of cascadedRemovals) {
    const removedPayload = buildRemovedPayload(entry);
    const removedFilename = await writeTodoPayload(
      p,
      sessionId,
      participant_id,
      removedPayload,
    );
    publish.push({
      filename: removedFilename,
      kind: "todo",
      participantId: participant_id,
      supersedes: removedPayload.supersedes,
    });
  }

  return { response, publish };
}

async function tryMkdir(target: string): Promise<boolean> {
  try {
    await mkdir(target, { recursive: false });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

class HtmlBundleWriter {
  constructor(
    private readonly p: Paths,
    private readonly sessionId: string,
  ) {}

  async assertWritableParticipant(participantId: string): Promise<void> {
    if (!(await sessionExists(this.p, this.sessionId))) {
      throw new Error(`session not found: ${this.sessionId}`);
    }
    const participants = await listParticipants(this.p);
    if (!(participantId in participants)) {
      throw new Error(`unknown participant: ${participantId}`);
    }
  }

  async write(body: PostHtmlBody): Promise<EventWriteOutcome<"html">> {
    assertValidation(validateNonProseAppendTo(body.append_to));
    await this.assertWritableParticipant(body.participant_id);
    await mkdir(this.p.sessionDir(this.sessionId), { recursive: true });

    const allocation = await this.allocateFolder(body.participant_id);
    try {
      await this.writeBundleFiles(allocation, body);
    } catch (err) {
      await rm(allocation.folderPath, { recursive: true, force: true }).catch(
        () => {},
      );
      throw err;
    }

    return outcome(
      writeResponse(allocation.folderName, body.participant_id, "html"),
      body.supersedes,
    );
  }

  private async allocateFolder(participantId: string): Promise<HtmlBundleAllocation> {
    let stamped = isoTimestamp();
    for (let attempt = 0; attempt < 256; attempt++) {
      const folderName = composeFilename({
        timestamp: stamped,
        participant_id: participantId,
        kind: "html",
      });
      const folderPath = join(this.p.sessionDir(this.sessionId), folderName);
      assertWithinSession(this.p, this.sessionId, folderPath);
      if (await tryMkdir(folderPath)) return { folderName, folderPath };
      stamped = bumpMillisecond(stamped);
    }
    throw new Error("could not allocate unique html bundle folder");
  }

  private async writeBundleFiles(
    allocation: HtmlBundleAllocation,
    body: PostHtmlBody,
  ): Promise<void> {
    await this.writeJsonFile(
      allocation.folderPath,
      "manifest.json",
      this.buildManifest(allocation.folderName, body),
    );
    await this.writeIndexFile(allocation.folderPath, body);
    await this.writeOptionalAsset(allocation.folderPath, "style.css", body.css);
    await this.writeOptionalAsset(allocation.folderPath, "script.js", body.js);
  }

  private buildManifest(folderName: string, body: PostHtmlBody): HtmlManifest {
    const manifest: HtmlManifest = { id: folderName.replace(/\.html$/, "") };
    if (typeof body.title === "string" && body.title.length > 0) {
      manifest.title = body.title;
    }
    if (Array.isArray(body.dependencies)) {
      manifest.dependencies = body.dependencies;
    }
    if (typeof body.append_to === "string" && body.append_to.length > 0) {
      manifest.append_to = body.append_to;
    }
    return manifest;
  }

  private async writeJsonFile(
    folderPath: string,
    fileName: string,
    value: unknown,
  ): Promise<void> {
    await this.writeBundleFile(
      folderPath,
      fileName,
      JSON.stringify(value, null, 2),
    );
  }

  private async writeIndexFile(
    folderPath: string,
    body: PostHtmlBody,
  ): Promise<void> {
    await this.writeBundleFile(
      folderPath,
      "index.html",
      assembleHtmlBundleIndex(body.html, {
        ...(typeof body.css === "string" && body.css.length > 0
          ? { css: body.css }
          : {}),
        ...(typeof body.js === "string" && body.js.length > 0
          ? { js: body.js }
          : {}),
      }),
    );
  }

  private async writeOptionalAsset(
    folderPath: string,
    fileName: string,
    contents: string | undefined,
  ): Promise<void> {
    if (typeof contents !== "string" || contents.length === 0) return;
    await this.writeBundleFile(folderPath, fileName, contents);
  }

  private async writeBundleFile(
    folderPath: string,
    fileName: string,
    contents: string,
  ): Promise<void> {
    const target = join(folderPath, fileName);
    assertWithinSession(this.p, this.sessionId, target);
    await writeFile(target, contents, { flag: "wx" });
  }
}

export async function writeHtmlEvent(
  p: Paths,
  sessionId: string,
  body: PostHtmlBody,
): Promise<EventWriteOutcome<"html">> {
  return new HtmlBundleWriter(p, sessionId).write(body);
}

export interface AlternativesWriteOutcome {
  response: EventWriteResult<"choices"> & {
    /** option id → generated html bundle filename. */
    html: Array<{ option_id: string; filename: string }>;
  };
  publish: EventPublishRecord[];
}

type AlternativeOption = PostAlternativesBody["options"][number];

function assertAlternativeOptions(options: PostAlternativesBody["options"]): void {
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error("alternatives requires at least one option");
  }
  const seenIds = new Set<string>();
  for (const option of options) assertAlternativeOption(option, seenIds);
}

function assertAlternativeOption(
  option: AlternativeOption,
  seenIds: Set<string>,
): void {
  if (typeof option.id !== "string" || option.id.length === 0) {
    throw new Error("alternatives option id required");
  }
  if (seenIds.has(option.id)) throw new Error(`duplicate option id: ${option.id}`);
  seenIds.add(option.id);
  if (typeof option.label !== "string" || option.label.length === 0) {
    throw new Error(`option ${option.id}: label required`);
  }
  if (typeof option.html !== "string" || option.html.length === 0) {
    throw new Error(`option ${option.id}: html required`);
  }
}

function htmlBodyForAlternativeOption(
  participantId: string,
  option: AlternativeOption,
): PostHtmlBody {
  return {
    participant_id: participantId,
    html: option.html,
    ...(option.css !== undefined ? { css: option.css } : {}),
    ...(option.js !== undefined ? { js: option.js } : {}),
    ...(option.title !== undefined ? { title: option.title } : {}),
    ...(option.dependencies !== undefined
      ? { dependencies: option.dependencies }
      : {}),
  };
}

function optionsWithHtmlRefs(
  options: AlternativeOption[],
  htmlMap: Array<{ option_id: string; filename: string }>,
): ChoicesOption[] {
  return options.map((option, index) => ({
    id: option.id,
    label: option.label,
    html: htmlMap[index]!.filename,
  }));
}

function alternativesChoicesPayload(
  body: PostAlternativesBody,
  options: ChoicesOption[],
): Omit<PostChoicesBody, "participant_id"> {
  return {
    id: body.id,
    question: body.question,
    options,
    multi: body.multi,
    ...(body.append_to !== undefined ? { append_to: body.append_to } : {}),
    ...(body.supersedes !== undefined ? { supersedes: body.supersedes } : {}),
  };
}

function choicesPublishRecord(
  filename: string,
  participantId: string,
  supersedes: string | undefined,
): EventPublishRecord<"choices"> {
  return {
    filename,
    kind: "choices",
    participantId,
    ...(supersedes !== undefined ? { supersedes } : {}),
  };
}

/* Atomic visual-alternatives write: one html bundle per option, then a single
   `choices` event whose options reference the generated bundle filenames. The
   choices event is the visible widget and the supersession unit, so child html
   bundles carry no append_to/supersedes. Bundles are written before the choices
   event (which needs their filenames); on any failure the new bundle dirs are
   cleaned up best-effort. */
export async function writeAlternativesEvent(
  p: Paths,
  sessionId: string,
  body: PostAlternativesBody,
): Promise<AlternativesWriteOutcome> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  assertChoiceModeMatchesQuestion(body);
  const writer = new HtmlBundleWriter(p, sessionId);
  await writer.assertWritableParticipant(body.participant_id);
  assertAlternativeOptions(body.options);

  const createdDirs: string[] = [];
  const htmlMap: Array<{ option_id: string; filename: string }> = [];
  const childPublish: EventPublishRecord[] = [];
  try {
    for (const option of body.options) {
      const written = await writer.write(
        htmlBodyForAlternativeOption(body.participant_id, option),
      );
      const filename = written.response.filename;
      createdDirs.push(join(p.sessionDir(sessionId), filename));
      htmlMap.push({ option_id: option.id, filename });
      childPublish.push(...written.publish);
    }

    const { participant_id, supersedes, append_to } = body;
    const filename = await writeEventFile(p, sessionId, {
      participant_id,
      kind: "choices",
      ext: "json",
      contents: JSON.stringify(
        alternativesChoicesPayload(
          body,
          optionsWithHtmlRefs(body.options, htmlMap),
        ),
        null,
        2,
      ),
    });
    return {
      response: {
        ...writeResponse(filename, participant_id, "choices"),
        html: htmlMap,
      },
      // Choices first so a live renderer consumes the option bundles before
      // they could flash as standalone embeds.
      publish: [
        choicesPublishRecord(filename, participant_id, supersedes),
        ...childPublish,
      ],
    };
  } catch (err) {
    await Promise.allSettled(
      createdDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    throw err;
  }
}

function validateGraph(nodes: FlowNode[], edges: FlowEdge[]): void {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) throw new Error(`duplicate node id: ${n.id}`);
    ids.add(n.id);
  }
  for (const e of edges) {
    if (!ids.has(e.source)) {
      throw new Error(`edge ${e.id} references missing node: ${e.source}`);
    }
    if (!ids.has(e.target)) {
      throw new Error(`edge ${e.id} references missing node: ${e.target}`);
    }
  }
}

export async function writeFlowEvent(
  p: Paths,
  sessionId: string,
  body: PostFlowBody,
): Promise<EventWriteOutcome<"flow">> {
  const { participant_id, supersedes, ...rest } = stripScopeFields(body);
  const payload: Omit<PostFlowBody, "participant_id"> =
    supersedes !== undefined ? { ...rest, supersedes } : rest;
  assertValidation(validateNonProseAppendTo(payload.append_to));
  validateGraph(payload.nodes, payload.edges);
  const filename = await writeEventFile(p, sessionId, {
    participant_id,
    kind: "flow",
    ext: "json",
    contents: JSON.stringify(payload, null, 2),
  });
  return outcome(writeResponse(filename, participant_id, "flow"), supersedes);
}

export async function writeFileRefEvent(
  p: Paths,
  sessionId: string,
  body: PostFileBody,
): Promise<EventWriteOutcome<"file">> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  const { participant_id, ...rest } = body;
  const payload: FileRefPayload = {
    id: rest.id,
    path: rest.path,
    mime_type: rest.mime_type,
  };
  if (rest.display_name !== undefined) payload.display_name = rest.display_name;
  if (rest.size_bytes !== undefined) payload.size_bytes = rest.size_bytes;
  if (rest.preview_kind !== undefined) payload.preview_kind = rest.preview_kind;
  if (rest.description !== undefined) payload.description = rest.description;
  if (rest.append_to !== undefined) payload.append_to = rest.append_to;
  /* Stamp the schema marker so renderers that key on it (FileCard's
     attachment-vs-legacy-fileref branch) treat this as a real attachment. */
  if (
    payload.display_name !== undefined ||
    payload.size_bytes !== undefined ||
    payload.preview_kind !== undefined ||
    rest.path.startsWith("attachments/")
  ) {
    payload.schema = "fmark.file.v1";
  }
  const filename = await writeEventFile(p, sessionId, {
    participant_id,
    kind: "file",
    ext: "json",
    contents: JSON.stringify(payload, null, 2),
  });
  return outcome(writeResponse(filename, participant_id, "file"));
}

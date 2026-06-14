import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
import {
  composeFilename,
  isoTimestamp,
  toIsoTimestamp,
} from "@f-mark/shared";
import { listParticipants } from "../participants.js";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { readEvents } from "../events/reader.js";
import { serializeProse } from "../events/prose.js";
import { serializeToolUse } from "../events/toolUse.js";
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
  supersedes?: string,
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

function prosePayload(body: ProseWriteBody): ProsePayload {
  const payload: ProsePayload = { content: body.content };
  if (body.name !== undefined) payload.name = body.name;
  if (body.append_to !== undefined) payload.append_to = body.append_to;
  if (body.mode !== undefined) payload.mode = body.mode;
  if (body.lines !== undefined) payload.lines = body.lines;
  if (body.file_path !== undefined) payload.file_path = body.file_path;
  if (body.diff_hunk !== undefined) payload.diff_hunk = body.diff_hunk;
  if (body.diff_base !== undefined) payload.diff_base = body.diff_base;
  if (body.line_context !== undefined) payload.line_context = body.line_context;
  if (body.removed !== undefined) payload.removed = body.removed;
  if (body.in_reply_to !== undefined) payload.in_reply_to = body.in_reply_to;
  if (body.supersedes !== undefined) payload.supersedes = body.supersedes;
  if (body.mentions !== undefined && body.mentions.length > 0) {
    payload.mentions = body.mentions;
  }
  if (body.source !== undefined) payload.source = body.source;
  if (body.arbitrary !== undefined) payload.arbitrary = body.arbitrary;
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
  const { participant_id: _participantId, path: _path, ...payload } = body;
  return payload;
}

function subagentOutputPayload(
  body: SubagentOutputWriteBody,
): Omit<SubagentOutputWriteBody, "participant_id" | "path"> {
  const { participant_id: _participantId, path: _path, ...payload } = body;
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
  const {
    participant_id: _participantId,
    path: _path,
    ...payload
  } = body;
  return payload;
}

function accessResponsePayload(
  body: AccessResponseWriteBody,
): AccessResponsePayload {
  const {
    participant_id: _participantId,
    path: _path,
    ...payload
  } = body;
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

export async function writeChoicesEvent(
  p: Paths,
  sessionId: string,
  body: PostChoicesBody,
): Promise<EventWriteOutcome<"choices">> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  await assertOptionHtmlRefs(p, sessionId, body.options);
  const { participant_id, supersedes, ...rest } = body;
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
  const { participant_id, ...rest } = body;
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
  const latestById = new Map<string, TodoEventRecord>();
  const createdAtById = new Map<string, string>();

  for (const event of todoEvents) {
    const id = event.payload.id;
    if (typeof id !== "string" || id.length === 0) continue;

    const existingCreatedAt = createdAtById.get(id);
    if (existingCreatedAt === undefined || event.timestamp < existingCreatedAt) {
      createdAtById.set(id, event.timestamp);
    }

    const existing = latestById.get(id);
    if (existing === undefined || event.timestamp > existing.timestamp) {
      latestById.set(id, event);
    }
  }

  const superseded = new Set<string>();
  for (const event of todoEvents) {
    const sup = event.payload.supersedes;
    if (typeof sup === "string" && sup.length > 0) superseded.add(sup);
  }

  const entries: TodoSnapshotEntry[] = [];
  for (const event of latestById.values()) {
    if (superseded.has(event.filename)) continue;
    const createdAt = createdAtById.get(event.payload.id);
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
  };
  if (payload.body !== undefined) node.body = payload.body;
  if (payload.assigned_to !== undefined) node.assigned_to = payload.assigned_to;
  if (payload.parent_id !== undefined) node.parent_id = payload.parent_id;
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

  const compareByGroup = (
    a: AnnotatedTodoTreeNode,
    b: AnnotatedTodoTreeNode,
  ): number => {
    const status = TODO_STATUS_RANK[a.status] - TODO_STATUS_RANK[b.status];
    if (status !== 0) return status;
    const assignee = (a.assigned_to ?? "\uffff").localeCompare(
      b.assigned_to ?? "\uffff",
    );
    if (assignee !== 0) return assignee;
    const aCreatedAt = createdAtById.get(a.id) ?? "";
    const bCreatedAt = createdAtById.get(b.id) ?? "";
    return aCreatedAt.localeCompare(bCreatedAt) || a.id.localeCompare(b.id);
  };
  const sortNodes = (nodes: AnnotatedTodoTreeNode[]): void => {
    nodes.sort(compareByGroup);
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
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

function assertWithinSession(
  p: Paths,
  sessionId: string,
  target: string,
): void {
  const sessionRoot = resolve(p.sessionDir(sessionId));
  const targetResolved = resolve(target);
  if (
    !targetResolved.startsWith(`${sessionRoot}/`) &&
    targetResolved !== sessionRoot
  ) {
    throw new Error("path escapes session root");
  }
}

function parseCompactTs(ts: string): Date {
  const ms = ts.length === 20 ? ts.slice(16, 19) : "000";
  return new Date(
    `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}.${ms}Z`,
  );
}

function bumpMillisecond(ts: string): string {
  const d = parseCompactTs(ts);
  d.setUTCMilliseconds(d.getUTCMilliseconds() + 1);
  return toIsoTimestamp(d);
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

export async function writeHtmlEvent(
  p: Paths,
  sessionId: string,
  body: PostHtmlBody,
): Promise<EventWriteOutcome<"html">> {
  assertValidation(validateNonProseAppendTo(body.append_to));
  const {
    participant_id,
    html,
    css,
    js,
    title,
    dependencies,
    supersedes,
    append_to,
  } = body;

  if (!(await sessionExists(p, sessionId))) {
    throw new Error(`session not found: ${sessionId}`);
  }
  const participants = await listParticipants(p);
  if (!(participant_id in participants)) {
    throw new Error(`unknown participant: ${participant_id}`);
  }

  await mkdir(p.sessionDir(sessionId), { recursive: true });

  let stamped = isoTimestamp();
  let folderName = "";
  let folderPath = "";
  let allocated = false;
  for (let attempt = 0; attempt < 256; attempt++) {
    folderName = composeFilename({
      timestamp: stamped,
      participant_id,
      kind: "html",
    });
    folderPath = join(p.sessionDir(sessionId), folderName);
    assertWithinSession(p, sessionId, folderPath);
    if (await tryMkdir(folderPath)) {
      allocated = true;
      break;
    }
    stamped = bumpMillisecond(stamped);
  }
  if (!allocated) throw new Error("could not allocate unique html bundle folder");

  const manifestId = folderName.replace(/\.html$/, "");
  const manifest: HtmlManifest = { id: manifestId };
  if (typeof title === "string" && title.length > 0) manifest.title = title;
  if (Array.isArray(dependencies)) manifest.dependencies = dependencies;
  if (typeof append_to === "string" && append_to.length > 0) {
    manifest.append_to = append_to;
  }

  const manifestPath = join(folderPath, "manifest.json");
  const indexPath = join(folderPath, "index.html");
  assertWithinSession(p, sessionId, manifestPath);
  assertWithinSession(p, sessionId, indexPath);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), {
    flag: "wx",
  });
  await writeFile(indexPath, html, { flag: "wx" });

  if (typeof css === "string" && css.length > 0) {
    const cssPath = join(folderPath, "style.css");
    assertWithinSession(p, sessionId, cssPath);
    await writeFile(cssPath, css, { flag: "wx" });
  }
  if (typeof js === "string" && js.length > 0) {
    const jsPath = join(folderPath, "script.js");
    assertWithinSession(p, sessionId, jsPath);
    await writeFile(jsPath, js, { flag: "wx" });
  }

  return outcome(writeResponse(folderName, participant_id, "html"), supersedes);
}

export interface AlternativesWriteOutcome {
  response: EventWriteResult<"choices"> & {
    /** option id → generated html bundle filename. */
    html: Array<{ option_id: string; filename: string }>;
  };
  publish: EventPublishRecord[];
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
  if (!(await sessionExists(p, sessionId))) {
    throw new Error(`session not found: ${sessionId}`);
  }
  const participants = await listParticipants(p);
  if (!(body.participant_id in participants)) {
    throw new Error(`unknown participant: ${body.participant_id}`);
  }
  if (!Array.isArray(body.options) || body.options.length === 0) {
    throw new Error("alternatives requires at least one option");
  }
  const seenIds = new Set<string>();
  for (const o of body.options) {
    if (typeof o.id !== "string" || o.id.length === 0) {
      throw new Error("alternatives option id required");
    }
    if (seenIds.has(o.id)) throw new Error(`duplicate option id: ${o.id}`);
    seenIds.add(o.id);
    if (typeof o.label !== "string" || o.label.length === 0) {
      throw new Error(`option ${o.id}: label required`);
    }
    if (typeof o.html !== "string" || o.html.length === 0) {
      throw new Error(`option ${o.id}: html required`);
    }
  }

  const createdDirs: string[] = [];
  const htmlMap: Array<{ option_id: string; filename: string }> = [];
  const childPublish: EventPublishRecord[] = [];
  try {
    for (const o of body.options) {
      const written = await writeHtmlEvent(p, sessionId, {
        participant_id: body.participant_id,
        html: o.html,
        ...(o.css !== undefined ? { css: o.css } : {}),
        ...(o.js !== undefined ? { js: o.js } : {}),
        ...(o.title !== undefined ? { title: o.title } : {}),
        ...(o.dependencies !== undefined
          ? { dependencies: o.dependencies }
          : {}),
      });
      const filename = written.response.filename;
      createdDirs.push(join(p.sessionDir(sessionId), filename));
      htmlMap.push({ option_id: o.id, filename });
      childPublish.push(...written.publish);
    }

    const options: ChoicesOption[] = body.options.map((o, i) => ({
      id: o.id,
      label: o.label,
      html: htmlMap[i]!.filename,
    }));
    const { participant_id, supersedes, append_to } = body;
    const payload = {
      id: body.id,
      question: body.question,
      options,
      multi: body.multi,
      ...(append_to !== undefined ? { append_to } : {}),
      ...(supersedes !== undefined ? { supersedes } : {}),
    };
    const filename = await writeEventFile(p, sessionId, {
      participant_id,
      kind: "choices",
      ext: "json",
      contents: JSON.stringify(payload, null, 2),
    });
    return {
      response: {
        ...writeResponse(filename, participant_id, "choices"),
        html: htmlMap,
      },
      // Choices first so a live renderer consumes the option bundles before
      // they could flash as standalone embeds.
      publish: [
        {
          filename,
          kind: "choices",
          participantId: participant_id,
          ...(supersedes !== undefined ? { supersedes } : {}),
        },
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

export function validateGraph(nodes: FlowNode[], edges: FlowEdge[]): void {
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
  const { participant_id, supersedes, ...rest } = body;
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


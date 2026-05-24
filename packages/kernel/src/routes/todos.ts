import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  EventKind,
  TodoEventRecord,
  TodoPayload,
  TodoTreeNode,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { writeEventFile } from "../events/writer.js";
import { readEvents } from "../events/reader.js";
import { validateNonProseAppendTo } from "../events/proseValidate.js";
import type { Bus, BusMessage } from "../ws/bus.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";

interface TodoBody {
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

type VisibleTodoStatus = TodoTreeNode["status"];
type TodoOwnership = "owned" | "NOT owned";

interface TodoOwnershipAnnotation {
  owned_by_viewer?: boolean;
  ownership?: TodoOwnership;
}

type AnnotatedTodoPayload = TodoPayload & TodoOwnershipAnnotation;
type AnnotatedTodoTreeNode = Omit<TodoTreeNode, "children"> &
  TodoOwnershipAnnotation & {
    children: AnnotatedTodoTreeNode[];
  };
type TodoBuckets = Record<VisibleTodoStatus, AnnotatedTodoPayload[]>;

const TODO_STATUS_RANK: Record<VisibleTodoStatus, number> = {
  wip: 0,
  open: 1,
  done: 2,
};

interface TodoSnapshotEntry {
  event: TodoEventRecord;
  payload: TodoPayload;
  createdAt: string;
}

interface TodoListResponse extends TodoBuckets {
  tree: AnnotatedTodoTreeNode[];
  viewer?: string;
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

function buildTodoSnapshot(todoEvents: TodoEventRecord[]): TodoSnapshotEntry[] {
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

  // Apply supersession: drop any event whose filename is referenced by
  // another event's `supersedes`.
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
): T & TodoOwnershipAnnotation {
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

function buildTodoListResponse(
  entries: TodoSnapshotEntry[],
  assignedTo?: string,
  viewer?: string,
): TodoListResponse {
  const buckets = createTodoBuckets();

  // Preserve newest-first order for the existing renderer buckets.
  const newestFirst = Array.from(entries).sort((a, b) =>
    b.event.timestamp.localeCompare(a.event.timestamp),
  );

  for (const entry of newestFirst) {
    const payload = entry.payload;
    if (!isVisibleTodoStatus(payload.status)) continue;
    if (!matchesAssignedTo(payload, assignedTo)) continue;
    buckets[payload.status].push(annotateOwnership(payload, viewer));
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

function buildTodoPayload(body: Omit<TodoBody, "participant_id">): TodoPayload {
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

async function ensureSession(
  p: Paths,
  sessionId: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await sessionExists(p, sessionId))) {
    reply.code(404).send({ error: `session not found: ${sessionId}` });
    return false;
  }
  return true;
}

export function registerTodoRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);

  function publish(
    sessionId: string,
    filename: string,
    kind: EventKind,
    participantId: string,
    supersedes?: string,
  ): void {
    const bus = getBus();
    const added: BusMessage = {
      type: "event_added",
      session_id: sessionId,
      filename,
      kind,
      participant_id: participantId,
    };
    bus.publish(added);
    if (typeof supersedes === "string") {
      bus.publish({
        type: "event_superseded",
        session_id: sessionId,
        filename: supersedes,
        supersedes: filename,
      });
    }
  }

  app.post<{ Params: { id: string }; Body: TodoBody }>(
    "/sessions/:id/events/todo",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "id", "title", "status"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            body: { type: "string" },
            status: {
              type: "string",
              enum: ["open", "wip", "done", "removed"],
            },
            assigned_to: { type: "string" },
            parent_id: { type: "string" },
            supersedes: { type: "string" },
            append_to: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const apCheck = validateNonProseAppendTo(req.body.append_to);
        if (!apCheck.ok) {
          reply.code(400);
          return { error: apCheck.error };
        }
        const { participant_id, ...rest } = req.body;
        const payload = buildTodoPayload(rest);
        let cascadedRemovals: TodoSnapshotEntry[] = [];
        if (payload.status === "removed") {
          const events = await readEvents(p, req.params.id, { kinds: ["todo"] });
          const todoEvents = events.filter(
            (e): e is TodoEventRecord => e.kind === "todo",
          );
          cascadedRemovals = findDescendants(
            buildTodoSnapshot(todoEvents),
            payload.id,
          );
        }

        const filename = await writeTodoPayload(
          p,
          req.params.id,
          participant_id,
          payload,
        );
        publish(req.params.id, filename, "todo", participant_id, rest.supersedes);

        for (const entry of cascadedRemovals) {
          const removedPayload = buildRemovedPayload(entry);
          const removedFilename = await writeTodoPayload(
            p,
            req.params.id,
            participant_id,
            removedPayload,
          );
          publish(
            req.params.id,
            removedFilename,
            "todo",
            participant_id,
            removedPayload.supersedes,
          );
        }

        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id,
          kind: "todo" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { assigned_to?: string; viewer?: string };
  }>(
    "/sessions/:id/todos",
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      const events = await readEvents(p, req.params.id, { kinds: ["todo"] });
      const todoEvents = events.filter(
        (e): e is TodoEventRecord => e.kind === "todo",
      );

      const assignedTo = req.query.assigned_to;
      const viewer = req.query.viewer;
      return buildTodoListResponse(
        buildTodoSnapshot(todoEvents),
        assignedTo,
        viewer,
      );
    },
  );
}

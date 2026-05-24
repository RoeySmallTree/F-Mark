import {
  type CSSProperties,
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import { Plus } from "lucide-react";
import { createClient, type PostTodoBody } from "../api/client.js";
import {
  TodoItem,
  type TodoInputField,
  type TodoInputRefs,
  type TodoItemNode,
  type TodoItemValues,
} from "../cards/TodoItem.js";
import { useStore } from "../state/store.js";
import {
  EMPTY_TODOS,
  fieldValue,
  flattenTree,
  generateTodoId,
  getAgentIds,
  latestTodoFilenames,
  nextIndentParentId,
  nextOutdentParentId,
  normalizeTodos,
  pickRandomAgentId,
  releaseAutoFirstTodo,
  reserveAutoFirstTodo,
  titleForPost,
} from "./todoPanelUtils.js";
import type { TodoListResponse } from "../api/client.js";
import { whoOf } from "../cards/format.js";

interface TodoTreeListProps {
  className?: string;
  compact?: boolean;
  showCounts?: boolean;
}

interface DraftTodo {
  id: string;
  parentId?: string;
  afterId?: string;
  assignedTo?: string;
}

type PendingFocus =
  | { kind: "todo"; id: string; field: TodoInputField }
  | { kind: "add-row" };

type VisibleTodoStatus = TodoTreeNode["status"];

const STATUS_FILTERS: Array<{
  status: VisibleTodoStatus;
  label: string;
}> = [
  { status: "open", label: "Open" },
  { status: "wip", label: "In progress" },
  { status: "done", label: "Done" },
];

const STATUS_GROUP_RANK: Record<VisibleTodoStatus, number> = {
  wip: 0,
  open: 1,
  done: 2,
};

const STATUS_GROUP_LABEL: Record<VisibleTodoStatus, string> = {
  wip: "In progress",
  open: "Open",
  done: "Done",
};

type StatusFilterState = Record<VisibleTodoStatus, boolean>;

function depthOffset(depth: number): string {
  if (depth <= 0) return "0px";
  return `calc(${Array.from({ length: depth }, () => "var(--todo-indent-step)").join(" + ")})`;
}

function draftNode(draft: DraftTodo): TodoItemNode {
  const node: TodoItemNode = {
    id: draft.id,
    title: "",
    status: "open",
    children: [],
  };
  if (draft.parentId !== undefined) node.parent_id = draft.parentId;
  if (draft.assignedTo !== undefined) node.assigned_to = draft.assignedTo;
  return node;
}

function nodeForItem(node: TodoTreeNode): TodoItemNode {
  return {
    id: node.id,
    title: node.title,
    body: node.body,
    status: node.status,
    assigned_to: node.assigned_to,
    parent_id: node.parent_id,
    children: node.children,
  };
}

function collectNodeMap(nodes: TodoTreeNode[]): Map<string, TodoTreeNode> {
  const map = new Map<string, TodoTreeNode>();
  const visit = (items: TodoTreeNode[]): void => {
    for (const item of items) {
      map.set(item.id, item);
      visit(item.children);
    }
  };
  visit(nodes);
  return map;
}

function assigneeSortKey(
  node: TodoTreeNode,
  participants: Record<string, { name: string }>,
): string {
  if (node.assigned_to === undefined) return "\uffff";
  return (
    participants[node.assigned_to]?.name.toLocaleLowerCase() ??
    node.assigned_to
  );
}

function orderSiblings(
  nodes: TodoTreeNode[],
  participants: Record<string, { name: string }>,
): TodoTreeNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const status =
        STATUS_GROUP_RANK[a.node.status] - STATUS_GROUP_RANK[b.node.status];
      if (status !== 0) return status;
      const assignee = assigneeSortKey(a.node, participants).localeCompare(
        assigneeSortKey(b.node, participants),
      );
      if (assignee !== 0) return assignee;
      return a.index - b.index;
    })
    .map(({ node }) => node);
}

function visibleOrderedTree(
  nodes: TodoTreeNode[],
  filters: StatusFilterState,
  participants: Record<string, { name: string }>,
): TodoTreeNode[] {
  const visible: TodoTreeNode[] = [];
  for (const node of orderSiblings(nodes, participants)) {
    const children = visibleOrderedTree(node.children, filters, participants);
    if (filters[node.status]) {
      visible.push({ ...node, children });
    } else {
      visible.push(...children);
    }
  }
  return visible;
}

export function TodoTreeList({
  className,
  compact = false,
  showCounts = true,
}: TodoTreeListProps): JSX.Element {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const userId = useStore((s) => s.currentUserId);
  const participants = useStore((s) => s.participants);
  const events = useStore((s) => s.events);
  const [todos, setTodos] = useState<TodoListResponse>(EMPTY_TODOS);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTodo | null>(null);
  const [statusFilters, setStatusFilters] = useState<StatusFilterState>({
    open: true,
    wip: true,
    done: true,
  });
  const [autoFirstTodoId, setAutoFirstTodoId] = useState<string | null>(null);
  const [latestOverrides, setLatestOverrides] = useState<Record<string, string>>(
    {},
  );
  const inputRefs = useRef<Map<string, TodoInputRefs>>(new Map());
  const addRowRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const loadRequestRef = useRef(0);
  const loadedSessionIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(currentSessionId);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
    setDraft(null);
    setAutoFirstTodoId(null);
    setLatestOverrides({});
    inputRefs.current.clear();
    pendingFocusRef.current = null;
  }, [currentSessionId]);

  const agentIds = useMemo(() => getAgentIds(participants), [participants]);
  const allNodeById = useMemo(() => collectNodeMap(todos.tree), [todos.tree]);
  const visibleTree = useMemo(
    () => visibleOrderedTree(todos.tree, statusFilters, participants),
    [todos.tree, statusFilters, participants],
  );
  const flat = useMemo(() => flattenTree(visibleTree), [visibleTree]);
  const flatById = useMemo(
    () => new Map(flat.map((item) => [item.id, item])),
    [flat],
  );

  const latestById = useMemo(() => {
    const latest = latestTodoFilenames(events);
    for (const [id, filename] of Object.entries(latestOverrides)) {
      latest.set(id, filename);
    }
    return latest;
  }, [events, latestOverrides]);

  const loadTodos = useCallback(async (): Promise<void> => {
    const requestId = ++loadRequestRef.current;
    const sessionId = currentSessionId;
    if (sessionId === null) {
      if (
        requestId !== loadRequestRef.current ||
        currentSessionIdRef.current !== null
      ) {
        return;
      }
      setTodos(EMPTY_TODOS);
      loadedSessionIdRef.current = null;
      setLoadedSessionId(null);
      return;
    }
    if (currentSessionIdRef.current !== sessionId) return;
    const client = createClient({ baseUrl: "", token });
    try {
      const next = normalizeTodos(await client.listTodos(sessionId));
      if (
        requestId !== loadRequestRef.current ||
        currentSessionIdRef.current !== sessionId
      ) {
        return;
      }
      setTodos(next);
      loadedSessionIdRef.current = sessionId;
      setLoadedSessionId(sessionId);
      setLoadError(null);
    } catch (err) {
      if (
        requestId !== loadRequestRef.current ||
        currentSessionIdRef.current !== sessionId
      ) {
        return;
      }
      /* Preserve last-good data when this session was already loaded —
         a transient kernel error shouldn't wipe the panel. Only clear
         when we have no good state for this session yet. */
      if (loadedSessionIdRef.current !== sessionId) {
        setTodos(EMPTY_TODOS);
      }
      loadedSessionIdRef.current = sessionId;
      setLoadedSessionId(sessionId);
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [currentSessionId, token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadTodos();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTodos, events.length]);

  const rememberLatest = useCallback((id: string, filename: string): void => {
    setLatestOverrides((current) => ({ ...current, [id]: filename }));
  }, []);

  const postTodo = useCallback(
    async (body: PostTodoBody): Promise<void> => {
      const sessionId = currentSessionId;
      if (sessionId === null) return;
      const client = createClient({ baseUrl: "", token });
      const result = await client.postTodo(sessionId, body);
      if (currentSessionIdRef.current !== sessionId) return;
      rememberLatest(body.id, result.filename);
      await loadTodos();
    },
    [currentSessionId, token, rememberLatest, loadTodos],
  );

  const registerInputs = useCallback(
    (id: string, inputs: TodoInputRefs | null): void => {
      if (inputs === null) {
        inputRefs.current.delete(id);
        return;
      }
      inputRefs.current.set(id, inputs);
    },
    [],
  );

  const focusTodo = useCallback(
    (id: string, field: TodoInputField = "title"): boolean => {
      const inputs = inputRefs.current.get(id);
      if (inputs === undefined) return false;
      const target = inputs[field];
      target.scrollIntoView?.({ block: "nearest" });
      target.focus();
      return true;
    },
    [],
  );

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) return;
    if (pending.kind === "add-row") {
      const button = addRowRef.current;
      if (button === null) return;
      button.focus();
      pendingFocusRef.current = null;
      return;
    }
    if (focusTodo(pending.id, pending.field)) {
      pendingFocusRef.current = null;
    }
  }, [draft, focusTodo, todos]);

  const actorId = userId;

  const makeCreateBody = useCallback(
    (
      id: string,
      patch: Partial<TodoPayload>,
      parentId?: string,
    ): PostTodoBody | null => {
      if (actorId === null) return null;
      const body: PostTodoBody = {
        participant_id: actorId,
        id,
        title: titleForPost(String(patch.title ?? "")),
        status: patch.status ?? "open",
      };
      const assignedTo =
        draft?.id === id ? draft.assignedTo : pickRandomAgentId(agentIds);
      if (assignedTo !== undefined) body.assigned_to = assignedTo;
      if (parentId !== undefined) body.parent_id = parentId;
      if (patch.body !== undefined) body.body = patch.body;
      return body;
    },
    [actorId, agentIds, draft],
  );

  const makeUpdateBody = useCallback(
    (
      node: TodoTreeNode,
      patch: Partial<TodoPayload>,
      assignedTo: string | null | undefined = undefined,
    ): PostTodoBody | null => {
      if (actorId === null) return null;
      const title =
        patch.title !== undefined ? patch.title : fieldValue(node.title);
      const body: PostTodoBody = {
        participant_id: actorId,
        id: node.id,
        title: titleForPost(title),
        status: patch.status ?? node.status,
      };
      if (patch.body !== undefined) {
        body.body = patch.body;
      } else if (node.body !== undefined) {
        body.body = node.body;
      }
      if (assignedTo === undefined) {
        if (node.assigned_to !== undefined) body.assigned_to = node.assigned_to;
      } else if (assignedTo !== null) {
        body.assigned_to = assignedTo;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "parent_id")) {
        if (patch.parent_id !== undefined) body.parent_id = patch.parent_id;
      } else if (node.parent_id !== undefined) {
        body.parent_id = node.parent_id;
      }
      const supersedes = latestById.get(node.id);
      if (supersedes !== undefined) body.supersedes = supersedes;
      return body;
    },
    [actorId, latestById],
  );

  useEffect(() => {
    if (currentSessionId === null || actorId === null) return;
    if (loadedSessionId !== currentSessionId) return;
    if (loadError !== null) return;
    const bucketCount =
      todos.open.length + todos.wip.length + todos.done.length;
    if (todos.tree.length > 0 || bucketCount > 0 || draft !== null) return;
    if (!reserveAutoFirstTodo(currentSessionId)) return;

    const id = generateTodoId();
    const body = makeCreateBody(id, { title: "" });
    if (body === null) {
      releaseAutoFirstTodo(currentSessionId);
      return;
    }
    setAutoFirstTodoId(id);
    void (async () => {
      try {
        await postTodo(body);
        releaseAutoFirstTodo(currentSessionId);
        setActionError(null);
      } catch (err) {
        releaseAutoFirstTodo(currentSessionId);
        setAutoFirstTodoId(null);
        setActionError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [
    actorId,
    currentSessionId,
    draft,
    loadedSessionId,
    loadError,
    makeCreateBody,
    postTodo,
    todos.tree.length,
    todos.open.length,
    todos.wip.length,
    todos.done.length,
  ]);

  async function updateExisting(
    node: TodoTreeNode,
    patch: Partial<TodoPayload>,
    assignedTo?: string | null,
  ): Promise<boolean> {
    const body = makeUpdateBody(node, patch, assignedTo);
    if (body === null) {
      setActionError("No active session or user.");
      return false;
    }
    try {
      await postTodo(body);
      if (
        autoFirstTodoId === node.id &&
        patch.title !== undefined &&
        patch.title.trim().length > 0
      ) {
        setAutoFirstTodoId(null);
      }
      setActionError(null);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  function dirtyValuesPatch(
    node: TodoTreeNode,
    values: TodoItemValues | undefined,
  ): Partial<TodoPayload> {
    if (values === undefined) return {};
    const patch: Partial<TodoPayload> = {};
    if (values.title !== fieldValue(node.title)) patch.title = values.title;
    if (values.body !== fieldValue(node.body)) patch.body = values.body;
    return patch;
  }

  async function createDraft(
    currentDraft: DraftTodo,
    patch: Partial<TodoPayload>,
  ): Promise<boolean> {
    if (
      patch.title !== undefined &&
      patch.title.trim().length === 0 &&
      patch.body === undefined
    ) {
      return false;
    }
    const body = makeCreateBody(currentDraft.id, patch, currentDraft.parentId);
    if (body === null) {
      setActionError("No active session or user.");
      return false;
    }
    try {
      await postTodo(body);
      setDraft(null);
      setActionError(null);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  function startRootDraft(): void {
    setDraft({
      id: generateTodoId(),
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  function startChildDraft(parentId: string): void {
    setDraft({
      id: generateTodoId(),
      parentId,
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  async function reparentTodo(
    node: TodoTreeNode,
    parentId: string | null,
    field: TodoInputField,
    values: { title: string; body: string },
  ): Promise<void> {
    if ((node.parent_id ?? null) === parentId) return;
    pendingFocusRef.current = { kind: "todo", id: node.id, field };
    const patch: Partial<TodoPayload> = {
      title: values.title,
      body: values.body,
      parent_id: parentId ?? undefined,
    };
    const updated = await updateExisting(node, patch);
    if (!updated) pendingFocusRef.current = null;
  }

  async function indentTodo(
    node: TodoTreeNode,
    field: TodoInputField,
    values: { title: string; body: string },
  ): Promise<void> {
    const parentId = nextIndentParentId(flat, node.id);
    if (parentId === null) return;
    await reparentTodo(node, parentId, field, values);
  }

  async function outdentTodo(
    node: TodoTreeNode,
    field: TodoInputField,
    values: { title: string; body: string },
  ): Promise<void> {
    const parentId = nextOutdentParentId(flat, node.id);
    if (parentId === null) return;
    await reparentTodo(
      node,
      parentId === "ROOT" ? null : parentId,
      field,
      values,
    );
  }

  function focusPreviousTodo(id: string): void {
    const item = flatById.get(id);
    const targetId = item?.prevSameDepthId ?? item?.prevId ?? null;
    if (targetId !== null) focusTodo(targetId, "title");
  }

  function focusNextTodo(id: string): void {
    const item = flatById.get(id);
    const targetId = item?.nextSameDepthId ?? item?.nextId ?? null;
    if (targetId !== null) focusTodo(targetId, "title");
  }

  function toggleStatusFilter(status: VisibleTodoStatus): void {
    setStatusFilters((current) => ({
      ...current,
      [status]: !current[status],
    }));
  }

  function groupKey(node: TodoTreeNode): string {
    return `${node.status}:${node.assigned_to ?? "unassigned"}`;
  }

  function assigneeLabel(node: TodoTreeNode): string {
    if (node.assigned_to === undefined) return "Unassigned";
    return whoOf(node.assigned_to, participants).name;
  }

  function renderGroupLabel(
    node: TodoTreeNode,
    depth: number,
  ): JSX.Element {
    return (
      <div
        key={`group-${depth}-${groupKey(node)}`}
        className="todo-group-label"
        data-status={node.status}
        style={
          {
            "--todo-depth-offset": depthOffset(depth),
          } as CSSProperties
        }
      >
        <span>{STATUS_GROUP_LABEL[node.status]}</span>
        <span>{assigneeLabel(node)}</span>
      </div>
    );
  }

  function previousSameDepthIdForDraft(
    currentDraft: DraftTodo,
    depth: number,
  ): string | null {
    let searchFrom = flat.length - 1;
    if (currentDraft.afterId !== undefined) {
      const idx = flat.findIndex((item) => item.id === currentDraft.afterId);
      if (idx >= 0) searchFrom = idx;
    } else if (currentDraft.parentId !== undefined) {
      const parentIdx = flat.findIndex(
        (item) => item.id === currentDraft.parentId,
      );
      const parentDepth = flatById.get(currentDraft.parentId)?.depth;
      if (parentIdx >= 0 && parentDepth !== undefined) {
        searchFrom = parentIdx;
        for (
          let idx = parentIdx + 1;
          idx < flat.length && flat[idx]!.depth > parentDepth;
          idx += 1
        ) {
          searchFrom = idx;
        }
      }
    }
    for (let idx = searchFrom; idx >= 0; idx -= 1) {
      const item = flat[idx]!;
      if (item.depth === depth) return item.id;
    }
    return null;
  }

  function indentDraft(currentDraft: DraftTodo, depth: number): void {
    const parentId = previousSameDepthIdForDraft(currentDraft, depth);
    if (parentId === null) return;
    setDraft((current) =>
      current?.id === currentDraft.id
        ? { ...current, parentId, afterId: undefined }
        : current,
    );
  }

  function outdentDraft(currentDraft: DraftTodo): void {
    if (currentDraft.parentId === undefined) return;
    const parent = flatById.get(currentDraft.parentId);
    setDraft((current) =>
      current?.id === currentDraft.id
        ? {
            ...current,
            parentId: parent?.parentId,
            afterId: currentDraft.parentId,
          }
        : current,
    );
  }

  async function removeTodo(
    node: TodoTreeNode,
    field?: TodoInputField,
    values?: TodoItemValues,
  ): Promise<void> {
    const item = flatById.get(node.id);
    const targetId = item?.prevId ?? item?.nextId ?? null;
    if (targetId === null) {
      pendingFocusRef.current = { kind: "add-row" };
    } else {
      pendingFocusRef.current = {
        kind: "todo",
        id: targetId,
        field: field ?? "title",
      };
    }
    const removed = await updateExisting(node, {
      ...dirtyValuesPatch(node, values),
      status: "removed",
    });
    if (!removed) pendingFocusRef.current = null;
  }

  async function commitExistingAndCreateBelow(
    node: TodoTreeNode,
    patch: { title: string; body: string },
  ): Promise<void> {
    const updated = await updateExisting(node, patch);
    if (!updated) return;
    setDraft({
      id: generateTodoId(),
      parentId: node.parent_id,
      afterId: node.id,
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  async function commitDraftAndCreateBelow(
    currentDraft: DraftTodo,
    patch: { title: string; body: string },
  ): Promise<void> {
    const created = await createDraft(currentDraft, patch);
    if (!created) return;
    setDraft({
      id: generateTodoId(),
      parentId: currentDraft.parentId,
      afterId: currentDraft.id,
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  function renderDraft(currentDraft: DraftTodo, depth: number): JSX.Element {
    const node = draftNode(currentDraft);
    return (
      <TodoItem
        key={currentDraft.id}
        node={node}
        depth={depth}
        participants={participants}
        agentIds={agentIds}
        compact={compact}
        draft
        showAddSubtask={false}
        autoFocusTitle
        registerInputs={registerInputs}
        onUpdate={async (patch) => {
          await createDraft(currentDraft, patch);
        }}
        onToggleDone={async (values) => {
          await createDraft(currentDraft, { ...values, status: "done" });
        }}
        onToggleWip={async (values) => {
          await createDraft(currentDraft, { ...values, status: "wip" });
        }}
        onRemove={async () => {
          setDraft(null);
        }}
        onAddSubtask={async (values) => {
          const created = await createDraft(currentDraft, values);
          if (!created) return;
          setDraft({
            id: generateTodoId(),
            parentId: currentDraft.id,
            assignedTo: pickRandomAgentId(agentIds),
          });
        }}
        onReassign={async (participantId) => {
          setDraft((current) =>
            current?.id === currentDraft.id
              ? {
                  ...current,
                  assignedTo: participantId ?? undefined,
                }
              : current,
          );
        }}
        onCommitAndCreateBelow={(patch) =>
          commitDraftAndCreateBelow(currentDraft, patch)
        }
        onIndent={() => indentDraft(currentDraft, depth)}
        onOutdent={() => outdentDraft(currentDraft)}
        onFocusPrev={() => {
          const targetId =
            currentDraft.afterId ??
            currentDraft.parentId ??
            flat[flat.length - 1]?.id ??
            null;
          if (targetId !== null) focusTodo(targetId, "title");
        }}
      />
    );
  }

  function renderNode(node: TodoTreeNode, depth: number): JSX.Element {
    const sourceNode = allNodeById.get(node.id) ?? node;
    const done = sourceNode.status === "done";
    const wip = sourceNode.status === "wip";
    const titlePlaceholder =
      autoFirstTodoId === node.id ? "First task title" : "Task title";
    return (
      <div key={node.id} className="todo-branch">
        <TodoItem
          node={nodeForItem(sourceNode)}
          depth={depth}
          participants={participants}
          agentIds={agentIds}
          compact={compact}
          titlePlaceholder={titlePlaceholder}
          autoFocusTitle={autoFirstTodoId === node.id}
          registerInputs={registerInputs}
          onUpdate={async (patch) => {
            await updateExisting(sourceNode, patch);
          }}
          onToggleDone={async (values) => {
            await updateExisting(sourceNode, {
              ...dirtyValuesPatch(sourceNode, values),
              status: done ? "open" : "done",
            });
          }}
          onToggleWip={async (values) => {
            await updateExisting(sourceNode, {
              ...dirtyValuesPatch(sourceNode, values),
              status: wip ? "open" : "wip",
            });
          }}
          onRemove={(field, values) => removeTodo(sourceNode, field, values)}
          onAddSubtask={async (values) => {
            const patch = dirtyValuesPatch(sourceNode, values);
            if (Object.keys(patch).length > 0) {
              const updated = await updateExisting(sourceNode, patch);
              if (!updated) return;
            }
            startChildDraft(sourceNode.id);
          }}
          onReassign={(participantId, values) =>
            updateExisting(
              sourceNode,
              dirtyValuesPatch(sourceNode, values),
              participantId,
            ).then(() => undefined)
          }
          onIndent={(field, patch) => indentTodo(sourceNode, field, patch)}
          onOutdent={(field, patch) => outdentTodo(sourceNode, field, patch)}
          onFocusPrev={() => focusPreviousTodo(sourceNode.id)}
          onFocusNext={() => focusNextTodo(sourceNode.id)}
          onCommitAndCreateBelow={(patch) =>
            commitExistingAndCreateBelow(sourceNode, patch)
          }
        />
        {renderLevel(node.children, depth + 1)}
        {draft?.parentId === node.id && draft.afterId === undefined
          ? renderDraft(draft, depth + 1)
          : null}
      </div>
    );
  }

  function renderNodeWithSiblingDraft(
    node: TodoTreeNode,
    depth: number,
  ): JSX.Element[] {
    const elements = [renderNode(node, depth)];
    if (
      draft !== null &&
      draft.parentId === node.parent_id &&
      draft.afterId === node.id
    ) {
      elements.push(renderDraft(draft, depth));
    }
    return elements;
  }

  function renderLevel(nodes: TodoTreeNode[], depth: number): JSX.Element[] {
    const elements: JSX.Element[] = [];
    const groupCount = new Set(nodes.map(groupKey)).size;
    let previousGroupKey: string | null = null;
    for (const node of nodes) {
      const nextGroupKey = groupKey(node);
      if (groupCount > 1 && nextGroupKey !== previousGroupKey) {
        elements.push(renderGroupLabel(node, depth));
        previousGroupKey = nextGroupKey;
      }
      elements.push(...renderNodeWithSiblingDraft(node, depth));
    }
    return elements;
  }

  const counts = {
    open: todos.open.length,
    wip: todos.wip.length,
    done: todos.done.length,
  };
  const shouldRenderRootDraft =
    draft !== null &&
    draft.parentId === undefined &&
    draft.afterId === undefined;

  return (
    <div className={className}>
      {showCounts ? (
        <div className="todo-counts" aria-label="Todo counts">
          {STATUS_FILTERS.map(({ status, label }) => (
            <button
              key={status}
              type="button"
              className="todo-count-chip"
              aria-pressed={statusFilters[status]}
              onClick={() => toggleStatusFilter(status)}
            >
              {label} {counts[status]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="todo-tree">
        {renderLevel(visibleTree, 0)}
        {shouldRenderRootDraft && draft !== null
          ? renderDraft(draft, 0)
          : null}
        {draft === null ? (
          <button
            ref={addRowRef}
            type="button"
            className="todo-add-row"
            onClick={startRootDraft}
            disabled={currentSessionId === null || actorId === null}
          >
            <Plus size={13} aria-hidden />
            Add task
          </button>
        ) : null}
        {loadError !== null ? (
          <p className="todo-load-note" title={loadError}>
            (kernel endpoint not yet available)
          </p>
        ) : null}
        {actionError !== null ? (
          <p className="todo-error" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

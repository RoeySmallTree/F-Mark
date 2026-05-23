import {
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

export function TodoTreeList({
  className,
  compact = false,
  showCounts = false,
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
  const [autoFirstTodoId, setAutoFirstTodoId] = useState<string | null>(null);
  const [latestOverrides, setLatestOverrides] = useState<Record<string, string>>(
    {},
  );
  const inputRefs = useRef<Map<string, TodoInputRefs>>(new Map());
  const addRowRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const loadRequestRef = useRef(0);
  const loadedSessionIdRef = useRef<string | null>(null);

  const agentIds = useMemo(() => getAgentIds(participants), [participants]);
  const flat = useMemo(() => flattenTree(todos.tree), [todos.tree]);
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
    if (currentSessionId === null) {
      if (requestId !== loadRequestRef.current) return;
      setTodos(EMPTY_TODOS);
      loadedSessionIdRef.current = null;
      setLoadedSessionId(null);
      return;
    }
    const client = createClient({ baseUrl: "", token });
    try {
      const next = normalizeTodos(await client.listTodos(currentSessionId));
      if (requestId !== loadRequestRef.current) return;
      setTodos(next);
      loadedSessionIdRef.current = currentSessionId;
      setLoadedSessionId(currentSessionId);
      setLoadError(null);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      /* Preserve last-good data when this session was already loaded —
         a transient kernel error shouldn't wipe the panel. Only clear
         when we have no good state for this session yet. */
      if (loadedSessionIdRef.current !== currentSessionId) {
        setTodos(EMPTY_TODOS);
      }
      loadedSessionIdRef.current = currentSessionId;
      setLoadedSessionId(currentSessionId);
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
      if (currentSessionId === null) return;
      const client = createClient({ baseUrl: "", token });
      const result = await client.postTodo(currentSessionId, body);
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
    (id: string, patch: Partial<TodoPayload>, parentId?: string): PostTodoBody | null => {
      if (actorId === null) return null;
      const body: PostTodoBody = {
        participant_id: actorId,
        id,
        title: titleForPost(String(patch.title ?? "")),
        status: "open",
      };
      const assignedTo = draft?.id === id ? draft.assignedTo : pickRandomAgentId(agentIds);
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

  async function removeTodo(
    node: TodoTreeNode,
    field?: TodoInputField,
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
    const removed = await updateExisting(node, { status: "removed" });
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
        onToggleDone={async () => undefined}
        onRemove={async () => {
          setDraft(null);
        }}
        onAddSubtask={() => {
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
      />
    );
  }

  function renderNode(node: TodoTreeNode, depth: number): JSX.Element {
    const done = node.status === "done";
    const titlePlaceholder =
      autoFirstTodoId === node.id ? "First task title" : "Task title";
    return (
      <div key={node.id} className="todo-branch">
        <TodoItem
          node={nodeForItem(node)}
          depth={depth}
          participants={participants}
          agentIds={agentIds}
          compact={compact}
          titlePlaceholder={titlePlaceholder}
          autoFocusTitle={autoFirstTodoId === node.id}
          registerInputs={registerInputs}
          onUpdate={async (patch) => {
            await updateExisting(node, patch);
          }}
          onToggleDone={async () => {
            await updateExisting(node, { status: done ? "open" : "done" });
          }}
          onRemove={(field) => removeTodo(node, field)}
          onAddSubtask={() => startChildDraft(node.id)}
          onReassign={(participantId) =>
            updateExisting(node, {}, participantId).then(() => undefined)
          }
          onIndent={(field, patch) => indentTodo(node, field, patch)}
          onOutdent={(field, patch) => outdentTodo(node, field, patch)}
          onFocusPrev={() => focusPreviousTodo(node.id)}
          onFocusNext={() => focusNextTodo(node.id)}
          onCommitAndCreateBelow={(patch) =>
            commitExistingAndCreateBelow(node, patch)
          }
        />
        {node.children.flatMap((child) =>
          renderNodeWithSiblingDraft(child, depth + 1),
        )}
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
          <span>Open {counts.open}</span>
          <span>WIP {counts.wip}</span>
          <span>Done {counts.done}</span>
        </div>
      ) : null}
      <div className="todo-tree">
        {todos.tree.flatMap((node) => renderNodeWithSiblingDraft(node, 0))}
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

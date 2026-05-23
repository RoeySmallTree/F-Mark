import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import { Plus } from "lucide-react";
import { createClient, type PostTodoBody } from "../api/client.js";
import { TodoItem, type TodoItemNode } from "../cards/TodoItem.js";
import { useStore } from "../state/store.js";
import {
  EMPTY_TODOS,
  fieldValue,
  generateTodoId,
  getAgentIds,
  latestTodoFilenames,
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
  assignedTo?: string;
}

function responseOrEmpty(response: TodoListResponse): TodoListResponse {
  return {
    open: response.open ?? [],
    wip: response.wip ?? [],
    done: response.done ?? [],
    tree: response.tree ?? [],
  };
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

  const agentIds = useMemo(() => getAgentIds(participants), [participants]);

  const latestById = useMemo(() => {
    const latest = latestTodoFilenames(events);
    for (const [id, filename] of Object.entries(latestOverrides)) {
      latest.set(id, filename);
    }
    return latest;
  }, [events, latestOverrides]);

  const loadTodos = useCallback(async (): Promise<void> => {
    if (currentSessionId === null) {
      setTodos(EMPTY_TODOS);
      setLoadedSessionId(null);
      return;
    }
    const client = createClient({ baseUrl: "", token });
    try {
      const next = responseOrEmpty(await client.listTodos(currentSessionId));
      setTodos(next);
      setLoadedSessionId(currentSessionId);
      setLoadError(null);
    } catch (err) {
      setTodos(EMPTY_TODOS);
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
      if (node.parent_id !== undefined) body.parent_id = node.parent_id;
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
    if (todos.tree.length > 0 || draft !== null) return;
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
  ]);

  async function updateExisting(
    node: TodoTreeNode,
    patch: Partial<TodoPayload>,
    assignedTo?: string | null,
  ): Promise<void> {
    const body = makeUpdateBody(node, patch, assignedTo);
    if (body === null) {
      setActionError("No active session or user.");
      return;
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createDraft(
    currentDraft: DraftTodo,
    patch: Partial<TodoPayload>,
  ): Promise<void> {
    if (
      patch.title !== undefined &&
      patch.title.trim().length === 0 &&
      patch.body === undefined
    ) {
      return;
    }
    const body = makeCreateBody(currentDraft.id, patch, currentDraft.parentId);
    if (body === null) {
      setActionError("No active session or user.");
      return;
    }
    try {
      await postTodo(body);
      setDraft(null);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
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
        onUpdate={(patch) => createDraft(currentDraft, patch)}
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
          onUpdate={(patch) => updateExisting(node, patch)}
          onToggleDone={() =>
            updateExisting(node, { status: done ? "open" : "done" })
          }
          onRemove={() => updateExisting(node, { status: "removed" })}
          onAddSubtask={() => startChildDraft(node.id)}
          onReassign={(participantId) =>
            updateExisting(node, {}, participantId)
          }
        />
        {node.children.map((child) => renderNode(child, depth + 1))}
        {draft?.parentId === node.id ? renderDraft(draft, depth + 1) : null}
      </div>
    );
  }

  const counts = {
    open: todos.open.length,
    wip: todos.wip.length,
    done: todos.done.length,
  };

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
        {todos.tree.map((node) => renderNode(node, 0))}
        {draft !== null && draft.parentId === undefined
          ? renderDraft(draft, 0)
          : null}
        {todos.tree.length === 0 && draft === null ? (
          <p className="todo-empty-note">Preparing first task...</p>
        ) : null}
        {draft === null ? (
          <button
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

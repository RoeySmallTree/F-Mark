/* TodoCard keeps the feed chrome around the shared TodoItem renderer. */

import { useMemo, useState, type JSX } from "react";
import type {
  AnyEventRecord,
  Participant,
  TodoPayload,
  TodoTreeNode,
} from "@f-mark/shared";
import { createClient, type PostTodoBody } from "../api/client.js";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import {
  buildTodoTreeFromEvents,
  fieldValue,
  flattenTree,
  generateTodoId,
  getSessionAgentIds,
  latestTodoFilenames,
  nextIndentParentId,
  nextOutdentParentId,
  pickRandomAgentId,
  titleForPost,
} from "../panels/todoPanelUtils.js";
import { useStore } from "../state/store.js";
import { formatWhen, whoOf } from "./format.js";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";
import {
  TodoItem,
  type TodoItemNode,
  type TodoItemValues,
} from "./TodoItem.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents?: AnyEventRecord[];
  /** "embedded" drops the head chrome so the todo card slots inside an
   *  anchor ProseCard via ProseInlineBlock. */
  variant?: "standalone" | "embedded";
}

interface InlineDraft {
  id: string;
  parentId?: string;
  assignedTo?: string;
}

function findNode(
  nodes: TodoTreeNode[],
  id: string,
): TodoTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

function nodeFromPayload(payload: TodoPayload): TodoItemNode {
  return {
    id: payload.id,
    title: payload.title,
    body: payload.body,
    status: payload.status,
    assigned_to: payload.assigned_to,
    parent_id: payload.parent_id,
    children: [],
  };
}

function nodeFromDraft(draft: InlineDraft): TodoItemNode {
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

function focusInlineTodo(id: string): void {
  const cards = document.querySelectorAll<HTMLElement>("[data-inline-todo-id]");
  for (const card of cards) {
    if (card.dataset.inlineTodoId !== id) continue;
    const title = card.querySelector<HTMLInputElement>("input.todo-title");
    title?.focus();
    return;
  }
}

export function TodoCard({
  event,
  participants,
  allEvents,
  variant = "standalone",
}: Props): JSX.Element | null {
  const payload = event.payload as TodoPayload;
  const who = whoOf(event.participant_id, participants);
  const done = payload.status === "done";
  const wip = payload.status === "wip";
  const removed = payload.status === "removed";
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);
  const agentIds = getSessionAgentIds(participants, sessionId);
  const [draft, setDraft] = useState<InlineDraft | null>(null);
  const [latestOverride, setLatestOverride] = useState<string | null>(null);

  const todoEvents = useMemo(() => {
    const source = allEvents ?? [event];
    return source.some((item) => item.filename === event.filename)
      ? source
      : [...source, event];
  }, [allEvents, event]);

  const todoTree = useMemo(
    () => buildTodoTreeFromEvents(todoEvents),
    [todoEvents],
  );
  const flat = useMemo(() => flattenTree(todoTree), [todoTree]);
  const flatById = useMemo(
    () => new Map(flat.map((item) => [item.id, item])),
    [flat],
  );
  const latestById = useMemo(
    () => latestTodoFilenames(todoEvents),
    [todoEvents],
  );
  const treeNode = findNode(todoTree, payload.id);
  if (allEvents !== undefined && treeNode === undefined) return null;
  const node = treeNode ?? nodeFromPayload(payload);
  const depth = flatById.get(payload.id)?.depth ?? 0;

  async function postTodo(body: PostTodoBody): Promise<void> {
    if (sessionId === null) return;
    const client = createClient({ baseUrl: "", token });
    const managedClient = createManagedAgentsClient({ baseUrl: "", token });
    const result = await client.postTodo(sessionId, body);
    if (
      body.assigned_to !== undefined &&
      agentIds.includes(body.assigned_to)
    ) {
      await managedClient.wakeSession(sessionId, {
        reason: "todo",
        source_event: result.filename,
        target_participant_ids: [body.assigned_to],
      });
    }
    if (body.id === payload.id) setLatestOverride(result.filename);
  }

  function baseBody(
    patch: Partial<TodoPayload>,
    assignedTo: string | null | undefined = undefined,
  ): PostTodoBody | null {
    const actor = userId ?? event.participant_id;
    const title =
      patch.title !== undefined ? patch.title : fieldValue(node.title);
    const body: PostTodoBody = {
      participant_id: actor,
      id: payload.id,
      title: titleForPost(title),
      status: patch.status ?? node.status,
      supersedes:
        latestOverride ?? latestById.get(payload.id) ?? event.filename,
    };
    if (patch.body !== undefined) {
      body.body = patch.body;
    } else if (node.body !== undefined) {
      body.body = node.body;
    }
    if (assignedTo === undefined) {
      if (node.assigned_to !== undefined) {
        body.assigned_to = node.assigned_to;
      }
    } else if (assignedTo !== null) {
      body.assigned_to = assignedTo;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "parent_id")) {
      if (patch.parent_id !== undefined) body.parent_id = patch.parent_id;
    } else if (node.parent_id !== undefined) {
      body.parent_id = node.parent_id;
    }
    return body;
  }

  async function updateTodo(
    patch: Partial<TodoPayload>,
    assignedTo?: string | null,
  ): Promise<void> {
    const body = baseBody(patch, assignedTo);
    if (body === null) return;
    await postTodo(body);
  }

  function dirtyValuesPatch(values: TodoItemValues): Partial<TodoPayload> {
    const patch: Partial<TodoPayload> = {};
    if (values.title !== fieldValue(node.title)) patch.title = values.title;
    if (values.body !== fieldValue(node.body)) patch.body = values.body;
    return patch;
  }

  async function createDraft(
    currentDraft: InlineDraft,
    values: TodoItemValues,
    status: TodoPayload["status"] = "open",
  ): Promise<boolean> {
    if (values.title.trim().length === 0 && values.body.length === 0) {
      return false;
    }
    const actor = userId ?? event.participant_id;
    const body: PostTodoBody = {
      participant_id: actor,
      id: currentDraft.id,
      title: titleForPost(values.title),
      status,
    };
    if (values.body.length > 0) body.body = values.body;
    if (currentDraft.parentId !== undefined) {
      body.parent_id = currentDraft.parentId;
    }
    if (currentDraft.assignedTo !== undefined) {
      body.assigned_to = currentDraft.assignedTo;
    }
    await postTodo(body);
    setDraft(null);
    return true;
  }

  async function saveDirtyThen(
    values: TodoItemValues,
    next: () => void,
  ): Promise<void> {
    const patch = dirtyValuesPatch(values);
    if (Object.keys(patch).length > 0) {
      await updateTodo(patch);
    }
    next();
  }

  async function reparent(
    values: TodoItemValues,
    parentId: string | null,
  ): Promise<void> {
    if ((node.parent_id ?? null) === parentId) return;
    await updateTodo({
      title: values.title,
      body: values.body,
      parent_id: parentId ?? undefined,
    });
    focusInlineTodo(payload.id);
  }

  return (
    <div
      className={[
        "todo-card",
        done ? "done" : "",
        removed ? "removed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-event-kind="todo"
      data-inline-todo-id={payload.id}
    >
      {variant !== "embedded" && (
        <div className="todo-head">
          <ParticipantAvatar
            participantId={who.id}
            kind={who.isUser ? "user" : "agent"}
            name={who.name}
            color={who.color}
            runtimeId={who.runtimeId}
            size="sm"
          />
          <span className="who">{who.name}</span>
          <span className="when">· {formatWhen(event.timestamp)}</span>
          <span className="status">
            {removed
              ? "todo removed"
              : done
                ? "todo completed"
                : wip
                  ? "todo in progress"
                  : "todo created"}
          </span>
        </div>
      )}
      <TodoItem
        node={node}
        depth={depth}
        participants={participants}
        agentIds={agentIds}
        onUpdate={(patch) => updateTodo(patch)}
        onToggleDone={(values) =>
          updateTodo({
            ...dirtyValuesPatch(values),
            status: done ? "open" : "done",
          })
        }
        onToggleWip={(values) =>
          updateTodo({
            ...dirtyValuesPatch(values),
            status: wip ? "open" : "wip",
          })
        }
        onRemove={(_field, values) =>
          updateTodo({
            ...(values !== undefined ? dirtyValuesPatch(values) : {}),
            status: "removed",
          })
        }
        onAddSubtask={(values) =>
          saveDirtyThen(values, () =>
            setDraft({
              id: generateTodoId(),
              parentId: payload.id,
              assignedTo: pickRandomAgentId(agentIds),
            }),
          )
        }
        onReassign={(participantId, values) =>
          updateTodo(dirtyValuesPatch(values), participantId)
        }
        onIndent={(_field, values) => {
          const parentId = nextIndentParentId(flat, payload.id);
          if (parentId === null) return;
          void reparent(values, parentId);
        }}
        onOutdent={(_field, values) => {
          const parentId = nextOutdentParentId(flat, payload.id);
          if (parentId === null) return;
          void reparent(values, parentId === "ROOT" ? null : parentId);
        }}
        onFocusPrev={() => {
          const item = flatById.get(payload.id);
          const targetId = item?.prevSameDepthId ?? item?.prevId ?? null;
          if (targetId !== null) focusInlineTodo(targetId);
        }}
        onFocusNext={() => {
          const item = flatById.get(payload.id);
          const targetId = item?.nextSameDepthId ?? item?.nextId ?? null;
          if (targetId !== null) focusInlineTodo(targetId);
        }}
        onCommitAndCreateBelow={async (values) => {
          await updateTodo(values);
          setDraft({
            id: generateTodoId(),
            parentId: node.parent_id,
            assignedTo: pickRandomAgentId(agentIds),
          });
        }}
      />
      {draft !== null ? (
        <TodoItem
          node={nodeFromDraft(draft)}
          depth={draft.parentId === payload.id ? depth + 1 : depth}
          participants={participants}
          agentIds={agentIds}
          draft
          showAddSubtask={false}
          autoFocusTitle
          onUpdate={async (values) => {
            await createDraft(draft, {
              title: String(values.title ?? ""),
              body: String(values.body ?? ""),
            });
          }}
          onToggleDone={(values) =>
            createDraft(draft, values, "done").then(() => undefined)
          }
          onToggleWip={(values) =>
            createDraft(draft, values, "wip").then(() => undefined)
          }
          onRemove={async () => setDraft(null)}
          onAddSubtask={async (values) => {
            const created = await createDraft(draft, values);
            if (!created) return;
            setDraft({
              id: generateTodoId(),
              parentId: draft.id,
              assignedTo: pickRandomAgentId(agentIds),
            });
          }}
          onReassign={async (participantId) => {
            setDraft((current) =>
              current?.id === draft.id
                ? { ...current, assignedTo: participantId ?? undefined }
                : current,
            );
          }}
          onCommitAndCreateBelow={async (values) => {
            const created = await createDraft(draft, values);
            if (!created) return;
            setDraft({
              id: generateTodoId(),
              parentId: draft.parentId,
              assignedTo: pickRandomAgentId(agentIds),
            });
          }}
          onIndent={() => {
            setDraft((current) =>
              current?.id === draft.id
                ? { ...current, parentId: payload.id }
                : current,
            );
          }}
          onOutdent={() => {
            if (draft.parentId === undefined) return;
            setDraft((current) =>
              current?.id === draft.id
                ? { ...current, parentId: node.parent_id }
                : current,
            );
          }}
          onFocusPrev={() => focusInlineTodo(payload.id)}
        />
      ) : null}
    </div>
  );
}

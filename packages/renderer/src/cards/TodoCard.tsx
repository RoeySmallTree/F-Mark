/* TodoCard keeps the feed chrome around the shared TodoItem renderer. */

import { type JSX } from "react";
import type {
  AnyEventRecord,
  Participant,
  TodoPayload,
} from "@f-mark/shared";
import { createClient, type PostTodoBody } from "../api/client.js";
import {
  generateTodoId,
  getAgentIds,
  pickRandomAgentId,
  titleForPost,
} from "../panels/todoPanelUtils.js";
import { useStore } from "../state/store.js";
import { formatWhen, whoOf } from "./format.js";
import { TodoItem, type TodoItemNode } from "./TodoItem.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
}

export function TodoCard({ event, participants }: Props): JSX.Element {
  const payload = event.payload as TodoPayload;
  const who = whoOf(event.participant_id, participants);
  const done = payload.status === "done";
  const removed = payload.status === "removed";
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);
  const agentIds = getAgentIds(participants);

  const node: TodoItemNode = {
    id: payload.id,
    title: payload.title,
    body: payload.body,
    status: payload.status,
    assigned_to: payload.assigned_to,
    parent_id: payload.parent_id,
    children: [],
  };

  async function postTodo(body: PostTodoBody): Promise<void> {
    if (sessionId === null) return;
    const client = createClient({ baseUrl: "", token });
    await client.postTodo(sessionId, body);
  }

  function baseBody(
    patch: Partial<TodoPayload>,
    assignedTo: string | null | undefined = undefined,
  ): PostTodoBody | null {
    const actor = userId ?? event.participant_id;
    const title = patch.title !== undefined ? patch.title : payload.title;
    const body: PostTodoBody = {
      participant_id: actor,
      id: payload.id,
      title: titleForPost(title),
      status: patch.status ?? payload.status,
      supersedes: event.filename,
    };
    if (patch.body !== undefined) {
      body.body = patch.body;
    } else if (payload.body !== undefined) {
      body.body = payload.body;
    }
    if (assignedTo === undefined) {
      if (payload.assigned_to !== undefined) {
        body.assigned_to = payload.assigned_to;
      }
    } else if (assignedTo !== null) {
      body.assigned_to = assignedTo;
    }
    if (payload.parent_id !== undefined) body.parent_id = payload.parent_id;
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

  async function addSubtask(): Promise<void> {
    const actor = userId ?? event.participant_id;
    const body: PostTodoBody = {
      participant_id: actor,
      id: generateTodoId(),
      title: " ",
      status: "open",
      parent_id: payload.id,
    };
    const assignedTo = pickRandomAgentId(agentIds);
    if (assignedTo !== undefined) body.assigned_to = assignedTo;
    await postTodo(body);
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
    >
      <div className="todo-head">
        <span
          className={["avatar", who.isUser ? "user" : "agent", "sm"].join(" ")}
          aria-hidden
        >
          {who.initial}
        </span>
        <span className="who">{who.name}</span>
        <span className="when">· {formatWhen(event.timestamp)}</span>
        <span className="status">
          {removed ? "todo removed" : done ? "todo completed" : "todo created"}
        </span>
      </div>
      <TodoItem
        node={node}
        depth={0}
        participants={participants}
        agentIds={agentIds}
        onUpdate={(patch) => updateTodo(patch)}
        onToggleDone={() =>
          updateTodo({ status: done ? "open" : "done" })
        }
        onRemove={() => updateTodo({ status: "removed" })}
        onAddSubtask={addSubtask}
        onReassign={(participantId) => updateTodo({}, participantId)}
      />
    </div>
  );
}

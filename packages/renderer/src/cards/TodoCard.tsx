/* TodoCard — inline todo with a checkbox. Toggling the checkbox writes a
   new todo event (same id) with the opposite status, supersedes pointing
   at the current event. */

import { type JSX } from "react";
import type {
  AnyEventRecord,
  Participant,
  TodoPayload,
} from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { formatWhen, whoOf } from "./format.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
}

export function TodoCard({ event, participants }: Props): JSX.Element {
  const payload = event.payload as TodoPayload;
  const who = whoOf(event.participant_id, participants);
  const done = payload.status === "done";
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);

  async function onToggle(): Promise<void> {
    if (sessionId === null) return;
    const actor = userId ?? event.participant_id;
    const client = createClient({ baseUrl: "", token });
    const nextStatus: "open" | "done" = done ? "open" : "done";
    const body: {
      participant_id: string;
      id: string;
      title: string;
      status: "open" | "done" | "wip";
      supersedes: string;
      body?: string;
      assigned_to?: string;
    } = {
      participant_id: actor,
      id: payload.id,
      title: payload.title,
      status: nextStatus,
      supersedes: event.filename,
    };
    if (payload.body !== undefined) body.body = payload.body;
    if (payload.assigned_to !== undefined) {
      body.assigned_to = payload.assigned_to;
    }
    await client.postTodo(sessionId, body);
  }

  const assigneeWho =
    payload.assigned_to !== undefined
      ? whoOf(payload.assigned_to, participants)
      : null;

  return (
    <div
      className={["todo-card", done ? "done" : ""].join(" ").trim()}
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
          {done ? "todo completed" : "todo created"}
        </span>
      </div>
      <div className="todo-body">
        <button
          type="button"
          className={["todo-check", done ? "done" : ""].join(" ").trim()}
          aria-pressed={done}
          aria-label={done ? "Mark as open" : "Mark as done"}
          onClick={() => void onToggle()}
        >
          {done ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              aria-hidden
            >
              <path d="m5 13 4 4 10-10" />
            </svg>
          ) : null}
        </button>
        <div className="todo-info">
          <div className="todo-title">{payload.title}</div>
          {payload.body !== undefined && payload.body.length > 0 && (
            <div className="todo-desc">"{payload.body}"</div>
          )}
          <div className="todo-meta">
            {assigneeWho !== null ? (
              <span className="assign-badge">
                <span
                  className={[
                    "avatar",
                    assigneeWho.isUser ? "user" : "agent",
                    "sm",
                  ].join(" ")}
                  aria-hidden
                >
                  {assigneeWho.initial}
                </span>
                assigned to {assigneeWho.name}
              </span>
            ) : (
              <span className="assign-badge unassigned">unassigned</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

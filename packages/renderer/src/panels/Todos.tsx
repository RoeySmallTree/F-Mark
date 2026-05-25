import { ChevronDown } from "lucide-react";
import type { TodoPayload } from "@f-mark/shared";
import {
  basename,
  groupRecordsByPath,
  scopeLabel,
  useAllSessionEvents,
} from "./allSessions.js";

type TodoStatus = "open" | "wip" | "done";

function isVisibleStatus(status: TodoPayload["status"]): status is TodoStatus {
  return status === "open" || status === "wip" || status === "done";
}

function latestTodos(
  events: ReturnType<typeof useAllSessionEvents>["groups"][number]["events"],
): Array<{ payload: TodoPayload; filename: string; participant_id: string }> {
  const latestById = new Map<
    string,
    { payload: TodoPayload; filename: string; participant_id: string; ts: string }
  >();
  const superseded = new Set<string>();

  for (const event of events) {
    if (event.kind !== "todo") continue;
    const payload = event.payload as TodoPayload;
    if (typeof payload.supersedes === "string") superseded.add(payload.supersedes);
    if (typeof payload.id !== "string" || payload.id.length === 0) continue;
    const existing = latestById.get(payload.id);
    if (existing === undefined || event.timestamp > existing.ts) {
      latestById.set(payload.id, {
        payload,
        filename: event.filename,
        participant_id: event.participant_id,
        ts: event.timestamp,
      });
    }
  }

  return [...latestById.values()]
    .filter((item) => !superseded.has(item.filename))
    .filter((item) => isVisibleStatus(item.payload.status))
    .sort((a, b) => {
      const statusRank: Record<TodoStatus, number> = { wip: 0, open: 1, done: 2 };
      return (
        statusRank[a.payload.status as TodoStatus] -
          statusRank[b.payload.status as TodoStatus] ||
        b.ts.localeCompare(a.ts)
      );
    });
}

export function Todos(): JSX.Element {
  const { groups, loading, error } = useAllSessionEvents(["todo"]);
  const visibleGroups = groups
    .map((group) => ({ group, todos: latestTodos(group.events) }))
    .filter(({ todos }) => todos.length > 0);
  const pathGroups = groupRecordsByPath(visibleGroups);

  return (
    <aside className="left-panel" role="tabpanel" aria-label="Todos panel">
      <div className="panel-head todo-panel-head">
        <h3>TODOS</h3>
        <div className="scope">
          across <b>all sessions</b>
        </div>
      </div>
      <div className="panel-list todo-panel-list">
        {error !== null ? <p className="panel-error">{error}</p> : null}
        {loading ? <p className="panel-empty">Loading todos...</p> : null}
        {!loading && pathGroups.length === 0 ? (
          <p className="panel-empty">No todos yet.</p>
        ) : null}
        {pathGroups.map((pathGroup) => (
          <details key={pathGroup.path} className="repo-session-group" open>
            <summary className="repo-session-summary">
              <ChevronDown
                size={13}
                aria-hidden="true"
                className="repo-session-chevron"
              />
              <span className="repo-session-title">{basename(pathGroup.path)}</span>
              <span className="repo-session-count">
                {pathGroup.records.reduce((n, record) => n + record.todos.length, 0)}
              </span>
              <span className="repo-session-path" title={pathGroup.path}>
                {pathGroup.path}
              </span>
            </summary>
            {pathGroup.records.map(({ group, todos }) => (
              <div key={group.session.id} className="repo-session-body">
                <div className="group-label">
                  {scopeLabel(group.path, group.session).toUpperCase()}
                </div>
                {todos.map(({ payload, filename, participant_id }, idx) => {
                  const assignee =
                    payload.assigned_to !== undefined
                      ? (group.participants[payload.assigned_to]?.name ??
                        payload.assigned_to)
                      : "Unassigned";
                  const author =
                    group.participants[participant_id]?.name ?? participant_id;
                  return (
                    <div
                      key={`${group.path}:${group.session.id}:${filename}`}
                      className="session-item staggered-row"
                      style={{
                        padding: "9px 10px",
                        ["--i" as string]: Math.min(idx, 5),
                      }}
                    >
                      <div className="row1">
                        <span
                          className={`status-dot ${
                            payload.status === "done" ? "active" : "idle"
                          }`}
                        />
                        <span className="slug">{payload.title}</span>
                      </div>
                      {payload.body !== undefined && payload.body.length > 0 ? (
                        <div className="summary">{payload.body}</div>
                      ) : null}
                      <div className="meta">
                        <span>{payload.status}</span>
                        <span>{assignee}</span>
                        <span>by {author}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </details>
        ))}
      </div>
    </aside>
  );
}

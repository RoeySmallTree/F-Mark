import type { JSX } from "react";
import { ChevronDown } from "lucide-react";
import type { SessionEventGroup, SessionMeta } from "../../api/client.js";
import { LoadingAnimation } from "../../components/LoadingAnimation.js";
import { basename, scopeLabel, sessionLabel } from "../allSessions.js";
import { RepoSessionGroup } from "../RepoSessionGroup.js";
import { TodoTreeList } from "../TodoTreeList.js";
import type { LatestTodo, TodoRecord } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  unassigned: "Unassigned",
  i: "--i",
} as const;

interface Props {
  currentPath: string;
  currentSession: SessionMeta | null;
  error: string | null;
  loading: boolean;
  pathGroups: Array<{ path: string; pathId: string; records: TodoRecord[] }>;
  shouldRenderEditor: boolean;
}

export function TodosView({
  currentPath,
  currentSession,
  error,
  loading,
  pathGroups,
  shouldRenderEditor,
}: Props): JSX.Element {
  return (
    <aside className="left-panel" role="tabpanel" aria-label="Todos panel">
      <TodosHeader currentSession={currentSession} />
      <div className="panel-list todo-panel-list">
        {shouldRenderEditor ? (
          <CurrentTodoGroup
            currentPath={currentPath}
            currentSession={currentSession}
          />
        ) : null}
        {error !== null ? <p className="panel-error">{error}</p> : null}
        {!shouldRenderEditor && (loading || pathGroups.length === 0) ? (
          <LoadingAnimation className="panel-loading" />
        ) : null}
        {pathGroups.map((pathGroup) => (
          <RepoSessionGroup
            key={pathGroup.path}
            count={todoPathGroupCount(pathGroup.records)}
            path={pathGroup.path}
          >
            {pathGroup.records.map((record) => (
              <TodoSessionGroup key={record.group.session.id} record={record} />
            ))}
          </RepoSessionGroup>
        ))}
      </div>
    </aside>
  );
}

function TodosHeader({
  currentSession,
}: {
  currentSession: SessionMeta | null;
}): JSX.Element {
  return (
    <div className="panel-head todo-panel-head">
      <h3>TODOS</h3>
      <div className="scope">
        across <b>all sessions</b>
        {currentSession !== null ? (
          <>
            {" "}
            · editing <b>{sessionLabel(currentSession)}</b>
          </>
        ) : null}
      </div>
    </div>
  );
}

function CurrentTodoGroup({
  currentPath,
  currentSession,
}: {
  currentPath: string;
  currentSession: SessionMeta | null;
}): JSX.Element {
  return (
    <details className="repo-session-group active-repo todo-current-group" open>
      <summary className="repo-session-summary">
        <ChevronDown
          size={13}
          aria-hidden="true"
          className="repo-session-chevron"
        />
        <span className="repo-session-title">
          {currentSession === null ? "No active session" : basename(currentPath)}
        </span>
        <span className="repo-session-count">edit</span>
        <span className="repo-session-path" title={currentPath}>
          {currentPath}
        </span>
      </summary>
      <div className="repo-session-body">
        <div className="group-label">
          {currentSession === null
            ? "NO ACTIVE SESSION"
            : scopeLabel(currentPath, currentSession).toUpperCase()}
        </div>
        <TodoTreeList className="todo-current-list" />
      </div>
    </details>
  );
}

function TodoSessionGroup({ record }: { record: TodoRecord }): JSX.Element {
  return (
    <div className="repo-session-body">
      <div className="group-label">
        {scopeLabel(record.group.path, record.group.session).toUpperCase()}
      </div>
      {record.todos.map((todo, index) => (
        <TodoHistoryItem
          key={`${record.group.path}:${record.group.session.id}:${todo.filename}`}
          group={record.group}
          index={index}
          todo={todo}
        />
      ))}
    </div>
  );
}

function TodoHistoryItem({
  group,
  index,
  todo,
}: {
  group: SessionEventGroup;
  index: number;
  todo: LatestTodo;
}): JSX.Element {
  const assignee =
    todo.payload.assigned_to !== undefined
      ? (group.participants[todo.payload.assigned_to]?.name ??
        todo.payload.assigned_to)
      : NO_LOOSE_STRING_VALUES.unassigned;
  const author =
    group.participants[todo.participant_id]?.name ?? todo.participant_id;
  return (
    <div
      className="session-item staggered-row"
      style={{
        padding: "9px 10px",
        [NO_LOOSE_STRING_VALUES.i as string]: Math.min(index, 5),
      }}
    >
      <div className="row1">
        <span
          className={`status-dot ${
            todo.payload.status === "done" ? "active" : "idle"
          }`}
        />
        <span className="slug">{todo.payload.title}</span>
      </div>
      {todo.payload.body !== undefined && todo.payload.body.length > 0 ? (
        <div className="summary">{todo.payload.body}</div>
      ) : null}
      <div className="meta">
        <span>{todo.payload.status}</span>
        <span>{assignee}</span>
        <span>by {author}</span>
      </div>
    </div>
  );
}

function todoPathGroupCount(records: TodoRecord[]): number {
  return records.reduce((count, record) => count + record.todos.length, 0);
}

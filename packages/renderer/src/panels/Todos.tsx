import { useMemo } from "react";
import { TodoTreeList } from "./TodoTreeList.js";
import { useStore } from "../state/store.js";

export function Todos(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);

  const slug = useMemo(
    () =>
      sessions.find((s) => s.id === currentSessionId)?.slug ?? "no session",
    [sessions, currentSessionId],
  );

  return (
    <aside className="left-panel" role="tabpanel" aria-label="Todos panel">
      <div className="panel-head todo-panel-head">
        <h3>TODOS</h3>
        <div className="scope">
          in <b>{slug}</b>
        </div>
      </div>
      <TodoTreeList className="panel-list todo-panel-list" />
    </aside>
  );
}

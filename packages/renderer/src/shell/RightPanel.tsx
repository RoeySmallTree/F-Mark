import { useMemo } from "react";
import { CheckSquare, FileText, MessageSquare } from "lucide-react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
import { RightTodos } from "../panels/right/RightTodos.js";
import { RightComments } from "../panels/right/RightComments.js";
import { RightNamed } from "../panels/right/RightNamed.js";
import { RightLog } from "../panels/right/RightLog.js";
import { CommentThreadOverlay } from "../overlays/CommentThreadOverlay.js";

export function RightPanel(): JSX.Element {
  const rightTab = useStore((s) => s.rightTab);
  const setRightTab = useStore((s) => s.setRightTab);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const events = useStore((s) => s.events);
  const commentTarget = useStore((s) => s.commentTarget);

  const slug = useMemo(
    () =>
      sessions.find((s) => s.id === currentSessionId)?.slug ?? "no session",
    [sessions, currentSessionId],
  );

  const agg = useMemo(() => aggregate(events), [events]);
  const commentsCount = useMemo(() => {
    let total = 0;
    for (const list of agg.commentsByTarget.values()) total += list.length;
    return total;
  }, [agg]);
  const namedCount = agg.named.length;

  // P14: When a pin is focused, replace the tab content with the
  // comment-thread overlay. The overlay reads from the same
  // commentsByTarget aggregation so no extra plumbing is needed.
  if (commentTarget !== null) {
    const comments = agg.commentsByTarget.get(commentTarget.file) ?? [];
    return (
      <aside className="right-panel" aria-label="Comment thread overlay">
        <CommentThreadOverlay
          targetFile={commentTarget.file}
          comments={comments}
        />
      </aside>
    );
  }

  return (
    <aside className="right-panel" aria-label="Right panel">
      <div className="right-tabs" role="tablist" aria-label="Right panel tabs">
        <button
          type="button"
          role="tab"
          aria-selected={rightTab === "todos"}
          className={rightTab === "todos" ? "active" : ""}
          onClick={() => setRightTab("todos")}
        >
          <CheckSquare size={12} aria-hidden="true" /> Todos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rightTab === "comments"}
          className={rightTab === "comments" ? "active" : ""}
          onClick={() => setRightTab("comments")}
        >
          <MessageSquare size={12} aria-hidden="true" /> Comments{" "}
          <span className="ct">{commentsCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rightTab === "named"}
          className={rightTab === "named" ? "active" : ""}
          onClick={() => setRightTab("named")}
        >
          <FileText size={12} aria-hidden="true" /> Named{" "}
          <span className="ct">{namedCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rightTab === "log"}
          className={rightTab === "log" ? "active" : ""}
          onClick={() => setRightTab("log")}
        >
          Log
        </button>
      </div>
      <div
        className="scope"
        style={{
          padding: "8px 14px 0",
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          color: "var(--ink-4)",
          letterSpacing: ".04em",
        }}
      >
        in <b style={{ color: "var(--ink-2)", fontWeight: 500 }}>{slug}</b>
      </div>
      <div className="panel-scroll">
        {rightTab === "todos" && <RightTodos />}
        {rightTab === "comments" && <RightComments />}
        {rightTab === "named" && <RightNamed />}
        {rightTab === "log" && <RightLog />}
      </div>
    </aside>
  );
}

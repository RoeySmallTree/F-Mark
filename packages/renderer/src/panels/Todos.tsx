import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { createClient } from "../api/client.js";
import type { TodoBuckets } from "../api/client.js";
import { useStore } from "../state/store.js";

const EMPTY_BUCKETS: TodoBuckets = { open: [], wip: [], done: [] };

/* Generates a short, URL-safe id for new todos (e.g. "td-x9k2"). */
function generateTodoId(): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `td-${rand}`;
}

export function Todos(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const userId = useStore((s) => s.currentUserId);
  const events = useStore((s) => s.events);
  const [buckets, setBuckets] = useState<TodoBuckets>(EMPTY_BUCKETS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const slug = useMemo(
    () =>
      sessions.find((s) => s.id === currentSessionId)?.slug ?? "no session",
    [sessions, currentSessionId],
  );

  useEffect(() => {
    if (currentSessionId === null) {
      setBuckets(EMPTY_BUCKETS);
      return;
    }
    let cancelled = false;
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      try {
        const next = await client.listTodos(currentSessionId);
        if (!cancelled) {
          setBuckets(next);
          setLoadError(null);
        }
      } catch (err) {
        // Endpoint may not yet exist on a running kernel — fall back to empty.
        if (!cancelled) {
          setBuckets(EMPTY_BUCKETS);
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, token, events.length]);

  const totalCount =
    buckets.open.length + buckets.wip.length + buckets.done.length;

  async function createTodo(): Promise<void> {
    if (currentSessionId === null || userId === null) {
      setCreateError("No active session or user.");
      return;
    }
    const title = newTitle.trim();
    if (title.length === 0) {
      setCreateError("Title is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      await client.postTodo(currentSessionId, {
        participant_id: userId,
        id: generateTodoId(),
        title,
        status: "open",
      });
      const next = await client.listTodos(currentSessionId);
      setBuckets(next);
      setNewTitle("");
      setShowAdd(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Todos panel"
    >
      <div
        className="panel-head"
        style={{
          flexDirection: "column",
          alignItems: "stretch",
          gap: 0,
          paddingBottom: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3>TODOS</h3>
          <button
            type="button"
            className="new-btn"
            onClick={() => setShowAdd((v) => !v)}
            disabled={currentSessionId === null || userId === null}
            aria-label="Add a new todo"
            aria-expanded={showAdd}
          >
            <Plus size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
            ADD
          </button>
        </div>
        <div className="scope">
          in <b>{slug}</b>
        </div>
      </div>
      {showAdd ? (
        <div
          style={{
            padding: "0 14px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <input
            className="form-input"
            placeholder="What needs doing?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createTodo();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setShowAdd(false);
                setNewTitle("");
                setCreateError(null);
              }
            }}
            autoFocus
            aria-label="New todo title"
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn-solid"
              disabled={creating || newTitle.trim().length === 0}
              onClick={() => void createTodo()}
            >
              {creating ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShowAdd(false);
                setNewTitle("");
                setCreateError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {createError !== null ? (
            <div
              className="form-error"
              role="alert"
              style={{ fontSize: 11.5 }}
            >
              {createError}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="panel-list" style={{ padding: "0 14px 12px" }}>
        {totalCount === 0 && !showAdd ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
              margin: "10px 4px",
            }}
          >
            No todos in <b>{slug}</b>. Click + Add.
          </p>
        ) : (
          (["open", "wip", "done"] as const).map((status) => {
            const items = buckets[status];
            if (items.length === 0) return null;
            return (
              <div key={status}>
                <div
                  className="group-label"
                  style={{ padding: "10px 0 4px" }}
                >
                  {status.toUpperCase()} ({items.length})
                </div>
                {items.map((t) => (
                  <div
                    key={t.id}
                    className={["session-item"].join(" ").trim()}
                    style={{ padding: "8px 8px" }}
                  >
                    <div className="row1">
                      <span
                        className={[
                          "status-dot",
                          status === "done" ? "active" : "idle",
                        ].join(" ")}
                        aria-hidden="true"
                      />
                      <span className="slug">{t.title}</span>
                    </div>
                    {t.assigned_to !== undefined ? (
                      <div className="meta">
                        <span>assigned to {t.assigned_to}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })
        )}
        {loadError !== null ? (
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10.5,
              color: "var(--ink-4)",
              marginTop: 10,
              padding: "0 4px",
            }}
            title={loadError}
          >
            (kernel endpoint not yet available)
          </p>
        ) : null}
      </div>
    </aside>
  );
}

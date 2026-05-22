import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../api/client.js";
import type { TodoBuckets } from "../../api/client.js";
import { useStore } from "../../state/store.js";

const EMPTY_BUCKETS: TodoBuckets = { open: [], wip: [], done: [] };

export function RightTodos(): JSX.Element {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const events = useStore((s) => s.events);
  const [buckets, setBuckets] = useState<TodoBuckets>(EMPTY_BUCKETS);

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
        if (!cancelled) setBuckets(next);
      } catch {
        if (!cancelled) setBuckets(EMPTY_BUCKETS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, token, events.length]);

  const counts = useMemo(
    () => ({
      open: buckets.open.length,
      wip: buckets.wip.length,
      done: buckets.done.length,
    }),
    [buckets],
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          color: "var(--ink-3)",
        }}
      >
        <span
          style={{
            background: "var(--line-2)",
            padding: "1px 6px",
            borderRadius: 4,
          }}
        >
          Open {counts.open}
        </span>
        <span style={{ color: "var(--ink-4)" }}>·</span>
        <span
          style={{
            background: "var(--line-2)",
            padding: "1px 6px",
            borderRadius: 4,
          }}
        >
          WIP {counts.wip}
        </span>
        <span style={{ color: "var(--ink-4)" }}>·</span>
        <span
          style={{
            background: "var(--line-2)",
            padding: "1px 6px",
            borderRadius: 4,
          }}
        >
          Done {counts.done}
        </span>
      </div>
      {(["open", "wip", "done"] as const).map((status) => {
        const items = buckets[status];
        return (
          <div key={status}>
            <div
              className="group-label"
              style={{ padding: "10px 0 6px" }}
            >
              {status.toUpperCase()} ({items.length})
            </div>
            {items.length === 0 ? (
              <p
                style={{
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  color: "var(--ink-4)",
                  fontSize: 12.5,
                  margin: "2px 0 6px",
                }}
              >
                {status === "open"
                  ? "No open todos."
                  : status === "wip"
                    ? "Nothing in progress."
                    : "Nothing done yet."}
              </p>
            ) : (
              items.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--line-2)",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "status-dot",
                      status === "done" ? "active" : "idle",
                    ].join(" ")}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      marginTop: 5,
                      flexShrink: 0,
                      background:
                        status === "done"
                          ? "var(--green)"
                          : status === "wip"
                            ? "var(--agent)"
                            : "transparent",
                      border:
                        status === "open"
                          ? "1.5px solid var(--ink-4)"
                          : "none",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "var(--ink)" }}>
                      {t.title}
                    </div>
                    {t.assigned_to !== undefined ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 4,
                          fontFamily: "var(--mono)",
                          fontSize: 10.5,
                          color: "var(--ink-4)",
                        }}
                      >
                        assigned to {t.assigned_to}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useMemo } from "react";
import type { ProsePayload } from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";

function shortPreview(text: string, max = 110): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function Comments(): JSX.Element {
  const events = useStore((s) => s.events);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const participants = useStore((s) => s.participants);

  const slug = useMemo(
    () =>
      sessions.find((s) => s.id === currentSessionId)?.slug ?? "no session",
    [sessions, currentSessionId],
  );

  const groups = useMemo(() => {
    const agg = aggregate(events);
    const out: { target: string; comments: typeof agg.events }[] = [];
    for (const [target, comments] of agg.commentsByTarget.entries()) {
      out.push({ target, comments });
    }
    return out;
  }, [events]);

  return (
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Comments panel"
    >
      <div
        className="panel-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 0 }}
      >
        <h3>COMMENTS</h3>
        <div className="scope">
          in <b>{slug}</b>
        </div>
      </div>
      <div className="panel-list" style={{ padding: "0 12px 12px" }}>
        {groups.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
              margin: "10px 4px",
            }}
          >
            No comments yet.
          </p>
        ) : (
          groups.map(({ target, comments }) => (
            <div key={target} style={{ marginBottom: 10 }}>
              <div className="group-label" style={{ padding: "10px 0 6px" }}>
                ON “{target}”
              </div>
              {comments.map((ev, idx) => {
                const payload = ev.payload as ProsePayload;
                const author =
                  participants[ev.participant_id]?.name ?? ev.participant_id;
                return (
                  <div
                    key={ev.filename}
                    className="session-item staggered-row"
                    style={{ padding: "9px 10px", ["--i" as string]: Math.min(idx, 5) }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 6,
                        fontSize: 12,
                      }}
                    >
                      <b style={{ color: "var(--ink)" }}>{author}</b>
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--ink-2)",
                        margin: "2px 0 4px",
                        fontFamily: "var(--serif)",
                        fontStyle: "italic",
                      }}
                    >
                      “{shortPreview(payload.content ?? "")}”
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

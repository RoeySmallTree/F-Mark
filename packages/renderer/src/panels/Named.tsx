import { useMemo } from "react";
import { FileText } from "lucide-react";
import type { ProsePayload } from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";

function shortPreview(text: string, max = 110): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function Named(): JSX.Element {
  const events = useStore((s) => s.events);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const participants = useStore((s) => s.participants);

  const slug = useMemo(
    () =>
      sessions.find((s) => s.id === currentSessionId)?.slug ?? "no session",
    [sessions, currentSessionId],
  );

  const namedEvents = useMemo(() => aggregate(events).named, [events]);

  function jumpTo(filename: string): void {
    const el = document.querySelector(`[data-event-filename="${filename}"]`);
    if (el !== null) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Named contributions panel"
    >
      <div
        className="panel-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 0 }}
      >
        <h3>NAMED</h3>
        <div className="scope">
          in <b>{slug}</b>
        </div>
      </div>
      <div className="panel-list" style={{ padding: "0 12px 12px" }}>
        {namedEvents.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
              margin: "10px 4px",
            }}
          >
            No named contributions yet.
          </p>
        ) : (
          namedEvents.map((ev) => {
            const payload = ev.payload as ProsePayload;
            const author = participants[ev.participant_id]?.name ?? ev.participant_id;
            return (
              <div
                key={ev.filename}
                role="button"
                tabIndex={0}
                className="session-item"
                style={{ padding: "10px 8px" }}
                onClick={() => jumpTo(ev.filename)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    jumpTo(ev.filename);
                  }
                }}
              >
                <div className="row1" style={{ gap: 9 }}>
                  <FileText
                    size={14}
                    style={{ color: "var(--agent)" }}
                    aria-hidden="true"
                  />
                  <span
                    style={{
                      fontFamily: "var(--serif)",
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--ink)",
                    }}
                  >
                    {payload.name ?? "(untitled)"}
                  </span>
                </div>
                {typeof payload.content === "string" && payload.content.length > 0 ? (
                  <div
                    className="summary"
                    style={{ paddingLeft: 23, fontStyle: "italic" }}
                  >
                    “{shortPreview(payload.content)}”
                  </div>
                ) : null}
                <div className="meta" style={{ paddingLeft: 23 }}>
                  <span>by {author}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

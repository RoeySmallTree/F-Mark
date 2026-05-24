import { useMemo } from "react";
import { FileText } from "lucide-react";
import type { ProsePayload } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { aggregate } from "../../state/aggregate.js";

function shortPreview(text: string, max = 130): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function RightNamed(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const namedEvents = useMemo(() => aggregate(events).named, [events]);

  function jumpTo(filename: string): void {
    const el = document.querySelector(`[data-event-filename="${filename}"]`);
    if (el !== null) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  if (namedEvents.length === 0) {
    return (
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          color: "var(--ink-3)",
          fontSize: 13,
        }}
      >
        No named contributions in this session.
      </p>
    );
  }

  return (
    <div>
      {namedEvents.map((ev, idx) => {
        const payload = ev.payload as ProsePayload;
        const author =
          participants[ev.participant_id]?.name ?? ev.participant_id;
        return (
          <div
            key={ev.filename}
            role="button"
            tabIndex={0}
            className="staggered-row"
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 0",
              borderBottom: "1px solid var(--line-2)",
              alignItems: "flex-start",
              cursor: "pointer",
              ["--i" as string]: Math.min(idx, 5),
            }}
            onClick={() => jumpTo(ev.filename)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                jumpTo(ev.filename);
              }
            }}
          >
            <FileText
              size={14}
              style={{ color: "var(--agent)", marginTop: 1, flexShrink: 0 }}
              aria-hidden="true"
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ink)",
                }}
              >
                {payload.name ?? "(untitled)"}
              </div>
              {typeof payload.content === "string" && payload.content.length > 0 ? (
                <div
                  style={{
                    fontFamily: "var(--serif)",
                    fontStyle: "italic",
                    fontSize: 12.5,
                    color: "var(--ink-3)",
                    margin: "2px 0",
                  }}
                >
                  “{shortPreview(payload.content)}”
                </div>
              ) : null}
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10.5,
                  color: "var(--ink-4)",
                }}
              >
                by {author}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

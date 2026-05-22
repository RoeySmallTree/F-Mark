import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useStore } from "../../state/store.js";

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function RightLog(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);

  const sorted = useMemo(
    () =>
      [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [events],
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <button
          type="button"
          title="Filters coming in P12"
          disabled
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            color: "var(--ink-3)",
            padding: "3px 8px",
            borderRadius: 4,
            border: "1px solid var(--line)",
            background: "var(--bg)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            cursor: "not-allowed",
            opacity: 0.6,
          }}
        >
          Filter <ChevronDown size={10} aria-hidden="true" />
        </button>
      </div>
      {sorted.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            color: "var(--ink-3)",
            fontSize: 13,
          }}
        >
          No events in this session.
        </p>
      ) : (
        sorted.map((ev) => {
          const p = participants[ev.participant_id];
          const kind = p?.kind === "user" ? "user" : "agent";
          return (
            <div
              key={ev.filename}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 14px 1fr",
                gap: 8,
                alignItems: "baseline",
                padding: "5px 0",
                borderBottom: "1px dashed var(--line-2)",
                fontFamily: "var(--mono)",
                fontSize: 11.5,
              }}
            >
              <span style={{ color: "var(--ink-4)" }}>
                {formatTs(ev.timestamp)}
              </span>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  background:
                    kind === "user" ? "var(--user)" : "var(--agent)",
                }}
              />
              <span style={{ color: "var(--ink-2)" }}>
                <span style={{ color: "var(--ink)", fontWeight: 500 }}>
                  {ev.kind}
                </span>{" "}
                <span style={{ color: "var(--ink-4)" }}>
                  {ev.participant_id}
                </span>
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

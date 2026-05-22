import { useMemo } from "react";
import type { ProsePayload } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { aggregate } from "../../state/aggregate.js";

function shortPreview(text: string, max = 140): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function RightComments(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);

  const groups = useMemo(() => {
    const agg = aggregate(events);
    const out: { target: string; comments: typeof agg.events }[] = [];
    for (const [target, comments] of agg.commentsByTarget.entries()) {
      out.push({ target, comments });
    }
    return out;
  }, [events]);

  if (groups.length === 0) {
    return (
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          color: "var(--ink-3)",
          fontSize: 13,
        }}
      >
        No comment threads in this session.
      </p>
    );
  }

  return (
    <div>
      {groups.map(({ target, comments }) => (
        <div
          key={target}
          style={{
            marginBottom: 18,
            paddingBottom: 12,
            borderBottom: "1px solid var(--line-2)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              textTransform: "uppercase",
              color: "var(--ink-3)",
              letterSpacing: ".08em",
              marginBottom: 6,
            }}
          >
            ON <b style={{ color: "var(--ink)" }}>{target}</b>
          </div>
          {comments.map((ev) => {
            const payload = ev.payload as ProsePayload;
            const author =
              participants[ev.participant_id]?.name ?? ev.participant_id;
            return (
              <div
                key={ev.filename}
                style={{ display: "flex", gap: 8, marginBottom: 8 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {author}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink)",
                      lineHeight: 1.5,
                    }}
                  >
                    {shortPreview(payload.content ?? "")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

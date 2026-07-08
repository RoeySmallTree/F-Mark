import { useMemo } from "react";
import { FileText } from "lucide-react";
import { useStore } from "../../state/store.js";
import { TabEmptyState } from "./TabEmptyState.js";
import { aggregate } from "../../state/aggregate.js";
import {
  activateEventOnKey,
  jumpToEvent,
  participantName,
  prosePayloadOf,
} from "../prosePanelUtils.js";

const NO_LOOSE_STRING_VALUES = {
  i: "--i",
  untitled: "(untitled)",
  named: "named",
  rightNamedEmpty: "right-named-empty",
} as const;

function shortPreview(text: string, max = 130): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function RightNamed(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const namedEvents = useMemo(() => aggregate(events).named, [events]);

  if (namedEvents.length === 0) {
    return (
      <TabEmptyState
        variant={NO_LOOSE_STRING_VALUES.named}
        fill
        testId={NO_LOOSE_STRING_VALUES.rightNamedEmpty}
      />
    );
  }

  return (
    <div>
      {namedEvents.map((ev, idx) => {
        const payload = prosePayloadOf(ev);
        const author = participantName(participants, ev.participant_id);
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
              [NO_LOOSE_STRING_VALUES.i as string]: Math.min(idx, 5),
            }}
            onClick={() => jumpToEvent(ev.filename)}
            onKeyDown={(event) => activateEventOnKey(event, ev.filename)}
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
                {payload.name ?? NO_LOOSE_STRING_VALUES.untitled}
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

/* LogFilterPopover — the Activity-log filter UI. Local state until the
   user clicks Apply, then a single LogFilter snapshot is emitted via the
   onApply callback. The parent (RightLog) holds the applied filter; we
   only own the draft. Reset returns the draft to DEFAULT_FILTER but does
   not clear the parent's applied filter until Apply is clicked. */

import { useMemo, useState } from "react";
import type { Participant } from "@f-mark/shared";
import { Popover } from "./Popover.js";
import {
  DEFAULT_FILTER,
  FILTERABLE_KINDS,
  type LogFilter,
  type LogFilterRange,
} from "./log-filter-types.js";

interface Props {
  anchorRect: DOMRect | null;
  initial: LogFilter;
  participants: Record<string, Participant>;
  onApply(filter: LogFilter): void;
  onClose(): void;
}

const RANGE_OPTIONS: { id: LogFilterRange; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7d" },
  { id: "30d", label: "Last 30d" },
  { id: "custom", label: "Custom" },
];

function toggleString(list: string[], value: string): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return [...list, value];
}

export function LogFilterPopover({
  anchorRect,
  initial,
  participants,
  onApply,
  onClose,
}: Props): JSX.Element {
  const [draft, setDraft] = useState<LogFilter>(() => ({ ...initial }));

  const participantEntries = useMemo(
    () => Object.entries(participants),
    [participants],
  );

  function reset(): void {
    setDraft({ ...DEFAULT_FILTER });
  }

  function apply(): void {
    onApply({ ...draft });
    onClose();
  }

  return (
    <Popover
      anchorRect={anchorRect}
      onClose={onClose}
      className="log-filter-popover"
      ariaLabel="Filter activity log"
    >
      <div className="pop-head">Filter activity</div>

      <div className="pop-section">
        <div className="pop-label">Kinds</div>
        <div className="pop-chips" role="group" aria-label="Filter by kind">
          {FILTERABLE_KINDS.map((kind) => {
            const on = draft.kinds.includes(kind);
            return (
              <button
                type="button"
                key={kind}
                role="checkbox"
                aria-checked={on}
                className={["pop-chip", on ? "on" : ""].join(" ").trim()}
                onClick={() =>
                  setDraft((d) => ({ ...d, kinds: toggleString(d.kinds, kind) }))
                }
              >
                {kind}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pop-section">
        <div className="pop-label">Participants</div>
        {participantEntries.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 12,
              color: "var(--ink-4)",
              margin: 0,
            }}
          >
            No participants yet.
          </p>
        ) : (
          <div
            className="pop-chips"
            role="group"
            aria-label="Filter by participant"
          >
            {participantEntries.map(([id, p]) => {
              const on = draft.participants.includes(id);
              return (
                <button
                  type="button"
                  key={id}
                  role="checkbox"
                  aria-checked={on}
                  className={["pop-chip", on ? "on" : ""].join(" ").trim()}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      participants: toggleString(d.participants, id),
                    }))
                  }
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pop-section">
        <div className="pop-label">Date range</div>
        <div className="seg-control" role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.id}
              aria-pressed={draft.range === opt.id}
              className={draft.range === opt.id ? "on" : ""}
              onClick={() => setDraft((d) => ({ ...d, range: opt.id }))}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {draft.range === "custom" && (
          <div className="pop-date-row">
            <input
              type="datetime-local"
              aria-label="Custom start"
              value={draft.customStart ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, customStart: e.target.value }))
              }
            />
            <input
              type="datetime-local"
              aria-label="Custom end"
              value={draft.customEnd ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, customEnd: e.target.value }))
              }
            />
          </div>
        )}
      </div>

      <div className="pop-section">
        <label className="pop-toggle">
          <input
            type="checkbox"
            checked={draft.namedOnly}
            onChange={(e) =>
              setDraft((d) => ({ ...d, namedOnly: e.target.checked }))
            }
          />
          Named only
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10.5,
              color: "var(--ink-4)",
              marginLeft: 6,
            }}
          >
            (prose with a name set)
          </span>
        </label>
      </div>

      <div className="pop-foot">
        <button type="button" className="btn-ghost" onClick={reset}>
          Reset
        </button>
        <button type="button" className="btn-solid" onClick={apply}>
          Apply
        </button>
      </div>
    </Popover>
  );
}

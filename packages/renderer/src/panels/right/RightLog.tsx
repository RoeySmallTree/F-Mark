/* RightLog — the Activity-log tab. Lists every event in the current
   session (newest first), with a Filter button that opens
   <LogFilterPopover>. Clicking a row smooth-scrolls the feed to the
   matching card via the [data-event-filename] attribute the Feed
   already emits.

   The applied filter lives in component state so it survives tab
   switches but not a reload. */

import { useMemo, useRef, useState, type JSX } from "react";
import { ChevronDown, X } from "lucide-react";
import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { LogFilterPopover } from "../../popovers/LogFilterPopover.js";
import {
  DEFAULT_FILTER,
  activeFilterCount,
  applyFilter,
  hasActiveFilter,
  type LogFilter,
} from "../../popovers/log-filter-types.js";

function formatTs(ts: string): string {
  // Compact ISO ("20260522T101530Z") and standard ISO both supported.
  let iso = ts;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(ts);
  if (m !== null) {
    iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function shortSummary(ev: AnyEventRecord): string {
  if (ev.kind === "prose") {
    const p = ev.payload as ProsePayload;
    if (typeof p.name === "string" && p.name.length > 0) {
      return `“${p.name}”`;
    }
    const text = (p.content ?? "").replace(/\s+/g, " ").trim();
    if (text.length === 0) return "(empty)";
    return text.length > 60 ? `${text.slice(0, 59)}…` : text;
  }
  if (ev.kind === "choices") {
    const p = ev.payload as { question?: string };
    const q = (p.question ?? "").replace(/\s+/g, " ").trim();
    return q.length > 0
      ? q.length > 60
        ? `“${q.slice(0, 57)}…”`
        : `“${q}”`
      : "<question>";
  }
  if (ev.kind === "choice") {
    const p = ev.payload as { selected?: string[] };
    return `chose ${(p.selected ?? []).join(", ") || "(none)"}`;
  }
  if (ev.kind === "turn-end") return "turn ended";
  if (ev.kind === "todo") {
    const p = ev.payload as { title?: string; status?: string };
    const title = (p.title ?? "").trim();
    return `[${p.status ?? "open"}] ${title || "(untitled)"}`;
  }
  if (ev.kind === "html") {
    const p = ev.payload as { title?: string; id?: string };
    return `“${p.title ?? p.id ?? "html"}”`;
  }
  if (ev.kind === "file") {
    const p = ev.payload as { path?: string; description?: string };
    return p.description ?? p.path ?? "file";
  }
  return ev.kind;
}

function chipLabelForRange(filter: LogFilter): string {
  switch (filter.range) {
    case "today":
      return "today";
    case "7d":
      return "last 7d";
    case "30d":
      return "last 30d";
    case "custom":
      return "custom range";
    case "all":
    default:
      return "";
  }
}

export function RightLog(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const activePopover = useStore((s) => s.activePopover);
  const openPopover = useStore((s) => s.openPopover);
  const closePopover = useStore((s) => s.closePopover);

  const [filter, setFilter] = useState<LogFilter>(DEFAULT_FILTER);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const slug = useMemo(
    () => sessions.find((s) => s.id === currentSessionId)?.slug ?? "session",
    [sessions, currentSessionId],
  );

  const filtered = useMemo(() => {
    const result = applyFilter(events, filter);
    return [...result].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [events, filter]);

  const popoverOpen =
    activePopover.key === "log-filter" && activePopover.anchorRect !== null;
  const filterCount = activeFilterCount(filter);
  const anyFilter = hasActiveFilter(filter);

  function openFilter(): void {
    if (buttonRef.current === null) return;
    openPopover("log-filter", buttonRef.current.getBoundingClientRect());
  }

  function jumpTo(filename: string): void {
    if (typeof document === "undefined") return;
    const el = document.querySelector(`[data-event-filename="${filename}"]`);
    if (el !== null && el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div data-testid="right-log">
      <div className="log-head">
        <span className="scope">
          in <b>{slug}</b> · newest first
        </span>
        <button
          ref={buttonRef}
          type="button"
          className="log-filter-btn"
          onClick={openFilter}
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
        >
          Filter
          {filterCount > 0 ? (
            <span className="filter-ct" aria-label={`${filterCount} active`}>
              {filterCount}
            </span>
          ) : null}
          <ChevronDown size={10} aria-hidden="true" />
        </button>
      </div>

      {anyFilter ? (
        <div
          className="active-chips"
          data-testid="active-chips"
          aria-label="Active filters"
        >
          {filter.kinds.map((k) => (
            <button
              type="button"
              key={`k-${k}`}
              className="pop-chip on"
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  kinds: f.kinds.filter((x) => x !== k),
                }))
              }
            >
              {k}
              <X size={9} aria-hidden="true" />
            </button>
          ))}
          {filter.participants.map((id) => {
            const p = participants[id];
            return (
              <button
                type="button"
                key={`p-${id}`}
                className="pop-chip on"
                onClick={() =>
                  setFilter((f) => ({
                    ...f,
                    participants: f.participants.filter((x) => x !== id),
                  }))
                }
              >
                {p?.name ?? id}
                <X size={9} aria-hidden="true" />
              </button>
            );
          })}
          {filter.range !== "all" ? (
            <button
              type="button"
              className="pop-chip on"
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  range: "all",
                  customStart: undefined,
                  customEnd: undefined,
                }))
              }
            >
              {chipLabelForRange(filter)}
              <X size={9} aria-hidden="true" />
            </button>
          ) : null}
          {filter.namedOnly ? (
            <button
              type="button"
              className="pop-chip on"
              onClick={() => setFilter((f) => ({ ...f, namedOnly: false }))}
            >
              named only
              <X size={9} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            color: "var(--ink-3)",
            fontSize: 13,
          }}
        >
          {events.length === 0
            ? "No events in this session."
            : "No events match the current filter."}
        </p>
      ) : (
        <div role="list">
          {filtered.map((ev) => {
            const p = participants[ev.participant_id];
            const kind = p?.kind === "user" ? "user" : "agent";
            const initial = (p?.name[0] ?? "?").toUpperCase();
            return (
              <button
                type="button"
                role="listitem"
                key={ev.filename}
                className="log-row"
                data-event-filename={ev.filename}
                data-event-kind={ev.kind}
                onClick={() => jumpTo(ev.filename)}
              >
                <span className="kind">{ev.kind}</span>
                <span className="ts">{formatTs(ev.timestamp)}</span>
                <span
                  className={["dot", kind].join(" ")}
                  aria-hidden="true"
                  title={p?.name ?? ev.participant_id}
                >
                  {""}
                </span>
                <span className="summary">
                  {shortSummary(ev)}
                  <span className="who">{initial}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {popoverOpen ? (
        <LogFilterPopover
          anchorRect={activePopover.anchorRect}
          initial={filter}
          participants={participants}
          onApply={(next) => setFilter(next)}
          onClose={closePopover}
        />
      ) : null}
    </div>
  );
}

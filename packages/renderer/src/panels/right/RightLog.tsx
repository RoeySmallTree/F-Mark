/* RightLog — the Activity-log tab. Lists every event in the current session
   in chronological order (oldest first / newest last), one row per event,
   aligned in fixed columns: identity (dot + initial) · time · kind tag with
   icon · summary. Clicking a row smooth-scrolls the feed to the matching
   card via the [data-event-filename] attribute the Feed already emits.

   The applied filter lives in the global store (state/store.ts) so it
   survives a Right-panel tab switch — RightLog unmounts when the user
   moves to Todos/Comments/Named, and local React state would otherwise
   reset to DEFAULT_FILTER on remount. */

import { useMemo, useRef, type JSX } from "react";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Flag,
  ListChecks,
  MousePointerClick,
  Paperclip,
  Text,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import type { AnyEventRecord, EventKind, ProsePayload } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { LogFilterPopover } from "../../popovers/LogFilterPopover.js";
import {
  DEFAULT_FILTER,
  activeFilterCount,
  applyFilter,
  hasActiveFilter,
  type LogFilter,
} from "../../popovers/log-filter-types.js";

/* Lucide icon per event kind. Picks something semantically grounded — no
   abstract glyphs that the reader would have to decode. */
const KIND_ICON: Record<EventKind, typeof Text> = {
  prose: Text,
  choices: ListChecks,
  choice: MousePointerClick,
  "turn-end": Flag,
  todo: CheckSquare,
  html: FileCode2,
  file: Paperclip,
  "tool-use": Wrench,
  flow: Workflow,
};

const KIND_LABEL: Record<EventKind, string> = {
  prose: "prose",
  choices: "choices",
  choice: "choice",
  "turn-end": "turn end",
  todo: "todo",
  html: "html",
  file: "file",
  "tool-use": "tool use",
  flow: "flow",
};

function formatTs(ts: string): string {
  /* Compact ISO ("20260522T101530Z") and standard ISO both supported. */
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
  const activePopover = useStore((s) => s.activePopover);
  const openPopover = useStore((s) => s.openPopover);
  const closePopover = useStore((s) => s.closePopover);
  const filter = useStore((s) => s.logFilter);
  const setFilter = useStore((s) => s.setLogFilter);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const result = applyFilter(events, filter);
    /* Oldest first, newest last — chronological top-to-bottom matches how
       people read a transcript / changelog. */
    return [...result].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [events, filter]);

  const popoverOpen =
    activePopover.key === "log-filter" && activePopover.anchorRect !== null;
  const filterCount = activeFilterCount(filter);
  const anyFilter = hasActiveFilter(filter);

  function toggleFilter(): void {
    if (popoverOpen) {
      closePopover();
      return;
    }
    if (buttonRef.current === null) return;
    openPopover("log-filter", buttonRef.current.getBoundingClientRect());
  }

  function clearAll(): void {
    setFilter(DEFAULT_FILTER);
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
        <span className="scope">oldest first · {filtered.length} events</span>
        <button
          ref={buttonRef}
          type="button"
          className="log-filter-btn"
          onClick={toggleFilter}
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
                setFilter({
                  ...filter,
                  kinds: filter.kinds.filter((x) => x !== k),
                })
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
                  setFilter({
                    ...filter,
                    participants: filter.participants.filter((x) => x !== id),
                  })
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
                setFilter({
                  ...filter,
                  range: "all",
                  customStart: undefined,
                  customEnd: undefined,
                })
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
              onClick={() => setFilter({ ...filter, namedOnly: false })}
            >
              named only
              <X size={9} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="active-chips-clear"
            onClick={clearAll}
            aria-label="Clear all filters"
          >
            clear all
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="log-empty">
          {events.length === 0
            ? "No events in this session."
            : "No events match the current filter."}
        </p>
      ) : (
        <div role="list" className="log-list">
          {filtered.map((ev) => {
            const p = participants[ev.participant_id];
            const kind = p?.kind === "user" ? "user" : "agent";
            const initial = (p?.name[0] ?? "?").toUpperCase();
            const KindIcon = KIND_ICON[ev.kind] ?? Text;
            return (
              <button
                type="button"
                role="listitem"
                key={ev.filename}
                className="log-row"
                data-event-filename={ev.filename}
                data-event-kind={ev.kind}
                onClick={() => jumpTo(ev.filename)}
                title={`${p?.name ?? ev.participant_id} · ${ev.kind} · ${formatTs(ev.timestamp)}`}
              >
                <span
                  className={["log-who", kind].join(" ")}
                  aria-label={p?.name ?? ev.participant_id}
                >
                  <span className="dot" aria-hidden="true" />
                  <span className="initial" aria-hidden="true">
                    {initial}
                  </span>
                </span>
                <span className="ts">{formatTs(ev.timestamp)}</span>
                <span
                  className="kind-tag"
                  data-kind={ev.kind}
                  aria-label={`Kind: ${KIND_LABEL[ev.kind] ?? ev.kind}`}
                >
                  <KindIcon size={11} aria-hidden="true" />
                  <span className="kind-tag-label">
                    {KIND_LABEL[ev.kind] ?? ev.kind}
                  </span>
                </span>
                <span className="summary">{shortSummary(ev)}</span>
                <ChevronRight
                  size={11}
                  className="row-jump"
                  aria-hidden="true"
                />
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

import { useMemo } from "react";
import {
  Columns,
  FileText,
  MessageSquare,
  Search,
  Settings,
} from "lucide-react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";

export const FMARK_GLYPH = `▟▙ ╱╲
▟▙ ▟▘▘`;

function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (
    (parts[0]![0] ?? "").toUpperCase() + (parts[1]![0] ?? "").toUpperCase()
  );
}

export function TopBar(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const participants = useStore((s) => s.participants);
  const events = useStore((s) => s.events);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const openModal = useStore((s) => s.openModal);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  const agg = useMemo(() => aggregate(events), [events]);
  const turn = agg.currentTurnParticipantPrefix;
  const turnPillClass =
    turn === "us"
      ? "turn-pill"
      : turn === "ag"
        ? "turn-pill thinking"
        : "turn-pill idle";
  const turnLabel =
    turn === "us" ? "Your turn" : turn === "ag" ? "Agent thinking…" : "Idle";

  const sortedParticipants = useMemo(() => {
    return Object.entries(participants)
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => {
        if (a.kind === b.kind) return a.id.localeCompare(b.id);
        return a.kind === "user" ? -1 : 1;
      });
  }, [participants]);

  return (
    <div className="topbar" role="banner">
      <div className="brand" title="F-Mark">
        <pre className="glyph" aria-hidden="true">
          {FMARK_GLYPH}
        </pre>
        <span className="name">F·Mark</span>
      </div>
      <button type="button" className="breadcrumb" aria-label="Project breadcrumb">
        <span className="proj">f-mark</span>
        <span className="sep">/</span>
        <span className="sess">{currentSession?.slug ?? "no session"}</span>
      </button>

      <div className="topbar-center">
        <div
          className="view-toggle"
          role="tablist"
          aria-label="Feed view mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "everything"}
            className={viewMode === "everything" ? "active" : ""}
            onClick={() => setViewMode("everything")}
            title="Show every event"
          >
            <Columns size={12} aria-hidden="true" /> Everything
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "document"}
            className={viewMode === "document" ? "active" : ""}
            onClick={() => setViewMode("document")}
            title="Show only named prose"
          >
            <FileText size={12} aria-hidden="true" /> Document
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "conversation"}
            className={viewMode === "conversation" ? "active" : ""}
            onClick={() => setViewMode("conversation")}
            title="Show only messages and turns"
          >
            <MessageSquare size={12} aria-hidden="true" /> Conversation
          </button>
        </div>
      </div>

      <div className="topbar-right">
        <div
          className={turnPillClass}
          role="status"
          aria-live="polite"
          title={turnLabel}
        >
          <span className="dot" aria-hidden="true" />
          {turnLabel}
        </div>
        <div
          className="participants"
          title="Participants"
          style={{ marginRight: 6 }}
        >
          {sortedParticipants.map((p) => (
            <span
              key={p.id}
              className={[
                "avatar",
                "lg",
                p.kind === "user" ? "user" : "agent",
              ].join(" ")}
              title={`${p.name} · ${p.id}`}
              style={
                p.color !== undefined ? { background: p.color } : undefined
              }
            >
              {initials(p.name ?? p.id)}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          title="Search (⌘K) — coming in P7"
          disabled
        >
          <Search size={15} aria-hidden="true" />
          <span className="kbd">⌘K</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Settings"
          aria-label="Open settings"
          onClick={() => openModal("settings")}
        >
          <Settings size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

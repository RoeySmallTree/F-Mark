import { useMemo } from "react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";

export function TopBar(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentId = useStore((s) => s.currentSessionId);
  const setCurrent = useStore((s) => s.setCurrentSession);
  const events = useStore((s) => s.events);
  const turn = useMemo(
    () => aggregate(events).currentTurnParticipantPrefix,
    [events],
  );
  const label = turn === "us" ? "Your turn" : "Agent's turn";
  const dot = turn === "us" ? "bg-emerald-500" : "bg-amber-500";

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-sm">
      <div className="font-semibold tracking-tight">F-Mark</div>
      <select
        className="rounded border border-neutral-300 px-2 py-1"
        value={currentId ?? ""}
        onChange={(e) => setCurrent(e.target.value || null)}
      >
        <option value="">Select a session…</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2 text-xs text-neutral-600">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        {label}
      </div>
    </header>
  );
}

import { useMemo } from "react";
import { useStore } from "../../state/store.js";
import { PathSwitcher } from "../PathSwitcher.js";

export function SessionBreadcrumb(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  return (
    <div className="breadcrumb" role="presentation">
      <PathSwitcher />
      <span className="sep">/</span>
      <span className="sess">{currentSession?.slug ?? "no session"}</span>
    </div>
  );
}

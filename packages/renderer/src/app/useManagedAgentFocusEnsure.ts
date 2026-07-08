import { useEffect, useRef } from "react";
import { createClient } from "../api/client.js";
import { rootScopeForSession } from "../api/rootScope.js";
import { findSessionForSelection, useStore } from "../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  hidden: "hidden",
} as const;

function scopeKeyFor(
  scope: NonNullable<ReturnType<typeof rootScopeForSession>>,
): string {
  return "pathId" in scope ? `path:${scope.pathId}` : `root:${scope.root}`;
}

export function useManagedAgentFocusEnsure(token: string | null): void {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const selectedPath = useStore((s) => s.selectedPath);
  const selectedPathId = useStore((s) => s.selectedPathId);
  const focusEnsureKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentSessionId === null) return;
    const selectedSession = findSessionForSelection(
      sessions,
      currentSessionId,
      selectedPathId,
      selectedPath,
    );
    const scope = rootScopeForSession(
      selectedSession,
      selectedPathId,
      selectedPath,
    );
    if (scope === null) return;

    const ensureKey = `${currentSessionId}::${scopeKeyFor(scope)}`;
    const client = createClient({ baseUrl: "", token });
    let timer: number | null = null;
    let cancelled = false;

    const clearTimer = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const run = (): void => {
      timer = null;
      if (cancelled || document.visibilityState === NO_LOOSE_STRING_VALUES.hidden) return;
      if (focusEnsureKeyRef.current === ensureKey) return;
      focusEnsureKeyRef.current = ensureKey;
      void client
        .ensureManagedAgents(currentSessionId, scope, { idle_only: true })
        .catch(() => {
          /* Focus resume is best-effort; interaction wakes ensure too. */
        });
    };
    const schedule = (): void => {
      clearTimer();
      timer = window.setTimeout(run, 250);
    };
    const onFocus = (): void => {
      focusEnsureKeyRef.current = null;
      schedule();
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === NO_LOOSE_STRING_VALUES.hidden) {
        focusEnsureKeyRef.current = null;
        clearTimer();
        return;
      }
      schedule();
    };

    schedule();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentSessionId, sessions, selectedPath, selectedPathId, token]);
}

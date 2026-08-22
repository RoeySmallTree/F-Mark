import type { ManagedTerminal } from "@f-mark/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createManagedAgentsClient,
  isProcessApiDisabledError,
  PROCESS_API_DISABLED_MESSAGE,
} from "../../../api/managedAgents.js";
import { useConfirmDestructive } from "../../../confirm/index.js";
import { useStore } from "../../../state/store.js";
import {
  clearActiveTerminal,
  loadActiveTerminal,
  saveActiveTerminal,
} from "../../../state/terminalActivePersistence.js";

const KILL_TERMINAL_DETAIL =
  "The shell and everything running in it end now. This cannot be undone.";

export interface RightTerminalController {
  terminals: ManagedTerminal[];
  activeSession: string | null;
  /** Sessions that have been activated at least once → mounted (keep-alive). */
  mountedSessions: string[];
  token: string | null;
  spawnPending: boolean;
  error: string | null;
  disabledReason: string | null;
  select(session: string): void;
  spawn(): void;
  close(session: string): void;
}

export function useRightTerminalController(): RightTerminalController {
  const managedTerminals = useStore((s) => s.managedTerminals);
  const addManagedTerminal = useStore((s) => s.addManagedTerminal);
  const removeManagedTerminal = useStore((s) => s.removeManagedTerminal);
  const token = useStore((s) => s.token);
  const activePathId = useStore((s) => s.activePathId);
  const disabledReason = useStore((s) => s.managedAgentsDisabledReason);
  const setManagedAgentsDisabledReason = useStore(
    (s) => s.setManagedAgentsDisabledReason,
  );

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );

  const terminals = useMemo(
    () => [...managedTerminals].sort((a, b) => a.index - b.index),
    [managedTerminals],
  );

  const [activeSession, setActiveSession] = useState<string | null>(() =>
    loadActiveTerminal(activePathId),
  );
  const activeRef = useRef(activeSession);
  activeRef.current = activeSession;

  const [mounted, setMounted] = useState<Set<string>>(() => new Set());
  const [spawnPending, setSpawnPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmDestructive = useConfirmDestructive();

  const mountSession = useCallback((session: string): void => {
    setMounted((prev) => {
      if (prev.has(session)) return prev;
      const next = new Set(prev);
      next.add(session);
      return next;
    });
  }, []);

  /* Reconcile the active tab against the live list + the persisted choice.
     Runs when the terminal set or the active project changes. Reads the
     current selection through a ref so it isn't a dependency (which would
     loop). Prefers the persisted selection — that is how a spawn from the
     participant strip hands focus to this panel — then the current one, then
     the most recent terminal. */
  useEffect(() => {
    const has = (s: string | null): s is string =>
      s !== null && terminals.some((t) => t.tmux_session === s);
    const persisted = loadActiveTerminal(activePathId);
    let next: string | null = null;
    if (has(persisted)) next = persisted;
    else if (has(activeRef.current)) next = activeRef.current;
    else if (terminals.length > 0)
      next = terminals[terminals.length - 1]!.tmux_session;

    if (next !== activeRef.current) setActiveSession(next);
    if (next !== null) mountSession(next);

    // Drop mounted entries whose terminal no longer exists.
    setMounted((prev) => {
      let changed = false;
      const live = new Set<string>();
      for (const s of prev) {
        if (terminals.some((t) => t.tmux_session === s)) live.add(s);
        else changed = true;
      }
      return changed ? live : prev;
    });
  }, [terminals, activePathId, mountSession]);

  const select = useCallback(
    (session: string): void => {
      setActiveSession(session);
      mountSession(session);
      saveActiveTerminal(activePathId, session);
    },
    [activePathId, mountSession],
  );

  const spawn = useCallback((): void => {
    setError(null);
    if (disabledReason !== null) {
      setError(disabledReason);
      return;
    }
    if (spawnPending) return;
    setSpawnPending(true);
    void apiClient
      .spawnTerminal()
      .then((resp) => {
        addManagedTerminal({
          tmux_session: resp.tmux_session,
          label: resp.label,
          index: resp.index,
        });
        select(resp.tmux_session);
      })
      .catch((err: unknown) => {
        if (isProcessApiDisabledError(err)) {
          setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
          setError(PROCESS_API_DISABLED_MESSAGE);
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
        console.error("spawn terminal failed", err);
      })
      .finally(() => setSpawnPending(false));
  }, [
    addManagedTerminal,
    apiClient,
    disabledReason,
    select,
    setManagedAgentsDisabledReason,
    spawnPending,
  ]);

  const close = useCallback(
    (session: string): void => {
      void (async (): Promise<void> => {
        const intent = await confirmDestructive({
          action: "terminal.kill",
          title: `Kill terminal ${session}?`,
          detail: KILL_TERMINAL_DETAIL,
        });
        if (intent === null) return;

        setError(null);
        void apiClient
          .killTerminal(session)
          .then(() => {
            removeManagedTerminal(session);
            clearActiveTerminal(activePathId, session);
            setMounted((prev) => {
              if (!prev.has(session)) return prev;
              const next = new Set(prev);
              next.delete(session);
              return next;
            });
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
            console.error("kill terminal failed", err);
          });
      })();
    },
    [activePathId, apiClient, confirmDestructive, removeManagedTerminal],
  );

  const mountedSessions = useMemo(
    () => terminals.filter((t) => mounted.has(t.tmux_session)).map((t) => t.tmux_session),
    [terminals, mounted],
  );

  return {
    terminals,
    activeSession,
    mountedSessions,
    token,
    spawnPending,
    error,
    disabledReason,
    select,
    spawn,
    close,
  };
}

import { useCallback, useMemo, useState } from "react";
import type { TopBarModalContextValue } from "./topBarModalContext.js";

export interface ReconnectTarget {
  participantId: string;
  sessionId: string;
  runtimeId: string;
}

export interface TopBarModalState {
  contextValue: TopBarModalContextValue;
  terminalOverlayFor: string | null;
  reconnectFor: ReconnectTarget | null;
  closeTerminalOverlay(): void;
  closeReconnect(): void;
}

export function useTopBarModals(): TopBarModalState {
  /* Standalone modal state. Each slot is non-null while that modal is
     mounted. Setting back to null closes and unmounts it. */
  const [terminalOverlayFor, setTerminalOverlayFor] = useState<string | null>(
    null,
  );
  const [reconnectFor, setReconnectFor] = useState<ReconnectTarget | null>(
    null,
  );

  const contextValue = useMemo<TopBarModalContextValue>(
    () => ({
      openTerminalOverlay: (tmuxSession) => setTerminalOverlayFor(tmuxSession),
      openReconnect: (participantId, sessionId, runtimeId) =>
        setReconnectFor({ participantId, sessionId, runtimeId }),
    }),
    [],
  );

  const closeTerminalOverlay = useCallback(
    () => setTerminalOverlayFor(null),
    [],
  );
  const closeReconnect = useCallback(() => setReconnectFor(null), []);

  return {
    contextValue,
    terminalOverlayFor,
    reconnectFor,
    closeTerminalOverlay,
    closeReconnect,
  };
}

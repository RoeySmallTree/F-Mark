import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SessionMeta } from "../../api/client.js";

export interface SessionContextMenuState {
  x: number;
  y: number;
  session: SessionMeta;
}

export interface SessionPanelUiState {
  contextMenu: SessionContextMenuState | null;
  draggingSessionId: string | null;
  dropTargetSessionId: string | null;
  error: string | null;
  query: string;
  closeContextMenu: () => void;
  openContextMenu: (x: number, y: number, session: SessionMeta) => void;
  setDraggingSessionId: Dispatch<SetStateAction<string | null>>;
  setDropTargetSessionId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setQuery: Dispatch<SetStateAction<string>>;
}

export function useSessionPanelUiState(): SessionPanelUiState {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [dropTargetSessionId, setDropTargetSessionId] = useState<string | null>(
    null,
  );
  const [contextMenu, setContextMenu] =
    useState<SessionContextMenuState | null>(null);

  const openContextMenu = useCallback(
    (x: number, y: number, session: SessionMeta): void => {
      setContextMenu({ x, y, session });
    },
    [],
  );

  const closeContextMenu = useCallback((): void => {
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    draggingSessionId,
    dropTargetSessionId,
    error,
    query,
    closeContextMenu,
    openContextMenu,
    setDraggingSessionId,
    setDropTargetSessionId,
    setError,
    setQuery,
  };
}

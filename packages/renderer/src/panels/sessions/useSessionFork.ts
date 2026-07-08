import {
  useCallback,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import type { ForkSessionResponse, SessionMeta } from "../../api/client.js";
import { sessionKey, sortSessions, withFallbackPath } from "./model.js";

interface UseSessionForkInput {
  activePath: string | null;
  closeContextMenu: () => void;
  setAllSessions: Dispatch<SetStateAction<SessionMeta[]>>;
}

export interface SessionForkState {
  closeFork: () => void;
  forkAnchorRect: DOMRect | null;
  forkTarget: SessionMeta | null;
  handleForked: (response: ForkSessionResponse) => void;
  openFork: (
    event: MouseEvent<HTMLButtonElement>,
    session: SessionMeta,
  ) => void;
  openForkFromMenu: (
    event: MouseEvent<HTMLButtonElement>,
    session: SessionMeta,
  ) => void;
}

export function useSessionFork(input: UseSessionForkInput): SessionForkState {
  const { activePath, closeContextMenu, setAllSessions } = input;
  const [forkTarget, setForkTarget] = useState<SessionMeta | null>(null);
  const [forkAnchorRect, setForkAnchorRect] = useState<DOMRect | null>(null);

  const openFork = useCallback(
    (event: MouseEvent<HTMLButtonElement>, session: SessionMeta): void => {
      event.preventDefault();
      event.stopPropagation();
      setForkTarget(withFallbackPath(session, activePath));
      setForkAnchorRect(event.currentTarget.getBoundingClientRect());
    },
    [activePath],
  );

  const openForkFromMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>, session: SessionMeta): void => {
      setForkAnchorRect(event.currentTarget.getBoundingClientRect());
      setForkTarget(session);
      closeContextMenu();
    },
    [closeContextMenu],
  );

  const closeFork = useCallback((): void => {
    setForkTarget(null);
    setForkAnchorRect(null);
  }, []);

  const handleForked = useCallback(
    (response: ForkSessionResponse): void => {
      setAllSessions((prev) => {
        const next = withFallbackPath(response.session, response.session.path ?? null);
        const key = sessionKey(next, null);
        const rest = prev.filter((session) => sessionKey(session, null) !== key);
        return sortSessions([next, ...rest]);
      });
    },
    [setAllSessions],
  );

  return {
    closeFork,
    forkAnchorRect,
    forkTarget,
    handleForked,
    openFork,
    openForkFromMenu,
  };
}

import { useMemo } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { ForkSessionResponse, SessionMeta } from "../../api/client.js";
import { useConfirmDestructive } from "../../confirm/index.js";
import type { SessionBadge } from "../../lib/sessionBadge.js";
import { useAllSessions } from "./useAllSessions.js";
import { useInlineSessionCreator } from "./useInlineSessionCreator.js";
import { useSessionBadgeResolver } from "./useSessionBadgeResolver.js";
import { useSessionDelete } from "./useSessionDelete.js";
import { useSessionFork } from "./useSessionFork.js";
import { useSessionPanelUiState } from "./useSessionPanelUiState.js";
import type { SessionContextMenuState } from "./useSessionPanelUiState.js";
import { useSessionRename } from "./useSessionRename.js";
import { useSessionRepoGroups } from "./useSessionRepoGroups.js";
import { useSessionSelection } from "./useSessionSelection.js";
import { useSessionStoreSnapshot } from "./storeSnapshot.js";
import type { RepoGroup } from "./model.js";

export type { SessionContextMenuState } from "./useSessionPanelUiState.js";

export interface SessionsController {
  activePath: string | null;
  allSessionsCount: number;
  contextMenu: SessionContextMenuState | null;
  currentSessionId: string | null;
  draggingSessionId: string | null;
  dropTargetSessionId: string | null;
  error: string | null;
  forkAnchorRect: DOMRect | null;
  forkTarget: SessionMeta | null;
  now: Date;
  loading: boolean;
  query: string;
  renameValue: string;
  renamingSessionId: string | null;
  repoGroups: RepoGroup[];
  switchingSessionKey: string | null;
  token: string | null;
  beginRename(session: SessionMeta): void;
  cancelRename(): void;
  closeContextMenu(): void;
  closeFork(): void;
  deleteSession(session: SessionMeta): Promise<void>;
  handleForked(response: ForkSessionResponse): void;
  handleInlineSessionCreated(path: string, created: SessionMeta): void;
  moveSessionInRepo(repoKey: string, fromId: string, toId: string): void;
  openContextMenu(x: number, y: number, session: SessionMeta): void;
  openFork(
    event: MouseEvent<HTMLButtonElement>,
    session: SessionMeta,
  ): void;
  openForkFromMenu(
    event: MouseEvent<HTMLButtonElement>,
    session: SessionMeta,
  ): void;
  openNewSessionModal(): void;
  saveRename(session: SessionMeta): Promise<void>;
  selectSession(session: SessionMeta): Promise<void>;
  sessionBadge(session: SessionMeta): SessionBadge;
  setDraggingSessionId: Dispatch<SetStateAction<string | null>>;
  setDropTargetSessionId: Dispatch<SetStateAction<string | null>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
}

export function useSessionsController(): SessionsController {
  const store = useSessionStoreSnapshot();
  const ui = useSessionPanelUiState();
  const all = useAllSessions({
    activePath: store.activePath,
    sessions: store.sessions,
    token: store.token,
  });
  const selection = useSessionSelection({
    activePath: store.activePath,
    activePathId: store.activePathId,
    currentSessionId: store.currentSessionId,
    setCurrentSession: store.setCurrentSession,
    setError: ui.setError,
    setParticipants: store.setParticipants,
    setSessions: store.setSessions,
    token: store.token,
  });
  const repo = useSessionRepoGroups({
    activePath: store.activePath,
    allSessions: all.allSessions,
    query: ui.query,
  });
  const rename = useSessionRename({
    activePath: store.activePath,
    closeContextMenu: ui.closeContextMenu,
    currentSessionId: store.currentSessionId,
    refreshSelectedRootSessions: selection.refreshSelectedRootSessions,
    setAllSessions: all.setAllSessions,
    setCurrentSession: store.setCurrentSession,
    setError: ui.setError,
    token: store.token,
  });
  const confirmDestructive = useConfirmDestructive();
  const deleteSession = useSessionDelete({
    activePath: store.activePath,
    activePathId: store.activePathId,
    allSessions: all.allSessions,
    closeContextMenu: ui.closeContextMenu,
    confirmDestructive,
    currentSessionId: store.currentSessionId,
    refreshSelectedRootSessions: selection.refreshSelectedRootSessions,
    setAllSessions: all.setAllSessions,
    setCurrentSession: store.setCurrentSession,
    setError: ui.setError,
    token: store.token,
  });
  const fork = useSessionFork({
    activePath: store.activePath,
    closeContextMenu: ui.closeContextMenu,
    setAllSessions: all.setAllSessions,
  });
  const sessionBadge = useSessionBadgeResolver({
    activePath: store.activePath,
    currentSessionId: store.currentSessionId,
    events: store.events,
    lastSeenBySession: store.lastSeenBySession,
    managedAgents: store.managedAgents,
    participants: store.participants,
  });
  const handleInlineSessionCreated = useInlineSessionCreator({
    refreshAllSessions: all.refreshAllSessions,
    selectSession: selection.selectSession,
    setAllSessions: all.setAllSessions,
  });
  const now = useMemo(() => new Date(), [all.allSessions.length]);

  return {
    activePath: store.activePath,
    allSessionsCount: all.allSessions.length,
    contextMenu: ui.contextMenu,
    currentSessionId: store.currentSessionId,
    draggingSessionId: ui.draggingSessionId,
    dropTargetSessionId: ui.dropTargetSessionId,
    error: ui.error,
    forkAnchorRect: fork.forkAnchorRect,
    forkTarget: fork.forkTarget,
    now,
    loading: all.loading,
    query: ui.query,
    renameValue: rename.renameValue,
    renamingSessionId: rename.renamingSessionId,
    repoGroups: repo.repoGroups,
    switchingSessionKey: selection.switchingSessionKey,
    token: store.token,
    beginRename: rename.beginRename,
    cancelRename: rename.cancelRename,
    closeContextMenu: ui.closeContextMenu,
    closeFork: fork.closeFork,
    deleteSession,
    handleForked: fork.handleForked,
    handleInlineSessionCreated,
    moveSessionInRepo: repo.moveSessionInRepo,
    openContextMenu: ui.openContextMenu,
    openFork: fork.openFork,
    openForkFromMenu: fork.openForkFromMenu,
    openNewSessionModal: store.openNewSessionModal,
    saveRename: rename.saveRename,
    selectSession: selection.selectSession,
    sessionBadge,
    setDraggingSessionId: ui.setDraggingSessionId,
    setDropTargetSessionId: ui.setDropTargetSessionId,
    setQuery: ui.setQuery,
    setRenameValue: rename.setRenameValue,
  };
}

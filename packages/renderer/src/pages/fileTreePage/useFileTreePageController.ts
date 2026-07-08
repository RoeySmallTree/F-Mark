import type { RefObject } from "react";
import type { SessionMeta } from "@f-mark/shared";
import type { FileScope } from "../../panels/fileViewer/fileScope.js";
import type { LaunchParams } from "./session.js";
import type { FileTreeStatus } from "./types.js";
import { useActiveFileTreeStore } from "./useActiveFileTreeStore.js";
import { useFileScopeValue } from "./useFileScopeValue.js";
import { useFileTreeClient } from "./useFileTreeClient.js";
import { useFileTreeLaunch } from "./useFileTreeLaunch.js";
import { useFileTreeSessionDropdown } from "./useFileTreeSessionDropdown.js";
import { useLaunchSessionBootstrap } from "./useLaunchSessionBootstrap.js";
import { useLaunchSessionState } from "./useLaunchSessionState.js";
import { useProjectPromotion } from "./useProjectPromotion.js";
import { useResolvedSessionActions } from "./useResolvedSessionActions.js";
import { useScopedFileTreeSocket } from "./useScopedFileTreeSocket.js";
import { useSessionSwitcher } from "./useSessionSwitcher.js";
import { useTokenSeed } from "./useTokenSeed.js";

export interface FileTreePageController {
  launch: LaunchParams;
  status: FileTreeStatus;
  allSessions: SessionMeta[];
  currentSessionId: string | null;
  activePath: string | null;
  activePathId: string | null;
  dropdownOpen: boolean;
  dropdownRef: RefObject<HTMLDivElement>;
  fileScope: FileScope;
  promoteBusy: boolean;
  promoteError: string | null;
  toggleDropdown(): void;
  switchToSession(session: SessionMeta): void;
  makeActiveProject(): Promise<void>;
}

export function useFileTreePageController(): FileTreePageController {
  const launch = useFileTreeLaunch();
  const client = useFileTreeClient(launch.token);
  const store = useActiveFileTreeStore();
  const sessionState = useLaunchSessionState();
  const sessionActions = useResolvedSessionActions(client);
  const dropdown = useFileTreeSessionDropdown();

  useTokenSeed(launch.token);

  useLaunchSessionBootstrap({
    launch,
    client,
    setAllSessions: sessionState.setAllSessions,
    setStatus: sessionState.setStatus,
    applySessionNamespace: sessionActions.applySessionNamespace,
    seedResolvedSession: sessionActions.seedResolvedSession,
  });

  useScopedFileTreeSocket({ client, token: launch.token });

  const switchToSession = useSessionSwitcher({
    currentSessionId: store.currentSessionId,
    activePathId: store.activePathId,
    closeDropdown: dropdown.close,
    sessionActions,
  });

  const { promoteBusy, promoteError, makeActiveProject } = useProjectPromotion(
    client,
    store.activePath,
  );

  const fileScope = useFileScopeValue(
    store.activePath,
    store.activePathId,
  );

  return {
    launch,
    status: sessionState.status,
    allSessions: sessionState.allSessions,
    currentSessionId: store.currentSessionId,
    activePath: store.activePath,
    activePathId: store.activePathId,
    dropdownOpen: dropdown.open,
    dropdownRef: dropdown.ref,
    fileScope,
    promoteBusy,
    promoteError,
    toggleDropdown: dropdown.toggle,
    switchToSession,
    makeActiveProject,
  };
}

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { createClient } from "./api/client.js";
import { connectWs } from "./api/ws.js";
import {
  createManagedAgentsClient,
  isProcessApiDisabledError,
  PROCESS_API_DISABLED_MESSAGE,
} from "./api/managedAgents.js";
import { useStore } from "./state/store.js";
import { TopBar } from "./shell/TopBar.js";
import { LeftRail } from "./shell/LeftRail.js";
import { LeftPanel } from "./shell/LeftPanel.js";
import { Feed } from "./shell/Feed.js";
import { RightPanel } from "./shell/RightPanel.js";
import { Compose } from "./shell/Compose.js";
import { AgentLauncher } from "./shell/AgentLauncher.js";
import { ModalRoot } from "./modals/ModalRoot.js";
const TerminalOverlay = lazy(() =>
  import("./modals/TerminalOverlay.js").then((m) => ({ default: m.TerminalOverlay })),
);
import { HookInstallModal } from "./modals/HookInstallModal.js";
import { IntegrationSetupModal } from "./modals/IntegrationSetupModal.js";
import { ReconnectModal } from "./modals/ReconnectModal.js";
import { OnboardingModal } from "./modals/onboarding/OnboardingModal.js";
import { readOnboarded } from "./state/settings.js";
import {
  DEFAULT_FILE_VIEWER_LAYOUT,
  clearPersistedLastFocusedSession,
  defaultPaneSizes,
  persistedLastFocusedSession,
} from "./state/store.js";
import { useShellPlacement } from "./hooks/useShellPlacement.js";
import {
  heightVar,
  placementKey,
  widthVar,
} from "./themes/layout.js";
import { ReplaceChatShell } from "./panels/fileViewer/shells/ReplaceChatShell.js";
import { ExtraPaneShell } from "./panels/fileViewer/shells/ExtraPaneShell.js";
import { ModalShell } from "./panels/fileViewer/shells/ModalShell.js";
import { CollapsedExtraButton } from "./panels/fileViewer/CollapsedExtraButton.js";
import { ModalReopenButton } from "./panels/fileViewer/ModalReopenButton.js";
import { FilesTreePreloader } from "./panels/right/files/FilesTreePreloader.js";
import { loadFilesTree } from "./panels/right/files/filesTreeLoader.js";
import { useHotkeys } from "./hooks/useHotkeys.js";
import {
  AgentSpawnProvider,
  useAgentSpawn,
} from "./hooks/useAgentSpawn.js";
import type { ManagedAgentWsMessage } from "@f-mark/shared";

function readTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

/* TopBarModalContext — surfaces the local modal-state setters TopBar
   needs to open the Phase-12 standalone modals (TerminalOverlay,
   HookInstallModal, ReconnectModal). These modals live as React state in
   <App/> rather than in the zustand store because their lifetime is tied
   to a specific tmux session / agent / runtime tuple and the existing
   activeModal slot only carries an enum key. */
export interface TopBarModalContextValue {
  openTerminalOverlay(tmuxSession: string): void;
  openHookInstall(runtimeId: string, participantId?: string): void;
  openReconnect(
    participantId: string,
    sessionId: string,
    runtimeId: string,
  ): void;
}

export const TopBarModalContext = createContext<TopBarModalContextValue | null>(
  null,
);

/* Narrow the renderer's BusMessage handler to managed-agent / presence /
   env-probe types. The shared types describe the kernel's exact wire
   contract so we type-guard before dispatching. */
function isManagedAgentMessage(m: unknown): m is ManagedAgentWsMessage {
  if (m === null || typeof m !== "object" || !("type" in m)) return false;
  const type = (m as { type: unknown }).type;
  return (
    type === "presence" ||
    type === "managed-agent.spawned" ||
    type === "managed-agent.killed" ||
    type === "managed-agent.updated" ||
    type === "managed-agent.terminal-spawned" ||
    type === "env-probe.updated"
  );
}

export function App(): JSX.Element {
  const token = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setEvents = useStore((s) => s.setEvents);
  const upsertEvent = useStore((s) => s.upsertEvent);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const activePath = useStore((s) => s.activePath);
  const activePathId = useStore((s) => s.activePathId);
  const activeRevision = useStore((s) => s.activeRevision);
  const currentUserId = useStore((s) => s.currentUserId);
  const openModal = useStore((s) => s.openModal);
  const setManagedAgents = useStore((s) => s.setManagedAgents);
  const setManagedTerminals = useStore((s) => s.setManagedTerminals);
  const setManagedAgentsDisabledReason = useStore(
    (s) => s.setManagedAgentsDisabledReason,
  );
  const setEnvProbe = useStore((s) => s.setEnvProbe);
  const setPathsState = useStore((s) => s.setPathsState);
  const dispatchManagedAgentWsMessage = useStore(
    (s) => s.dispatchManagedAgentWsMessage,
  );

  /* Phase-12 standalone modal state. Each slot is non-null while that
     modal is mounted. Setting back to null closes (and unmounts) the
     modal — TerminalOverlay disposes its xterm + WS, ReconnectModal /
     HookInstall release their fetch handles. */
  const [terminalOverlayFor, setTerminalOverlayFor] = useState<string | null>(
    null,
  );
  const [hookInstallFor, setHookInstallFor] = useState<{
    runtimeId: string;
    participantId?: string;
  } | null>(null);
  const [reconnectFor, setReconnectFor] = useState<{
    participantId: string;
    sessionId: string;
    runtimeId: string;
  } | null>(null);

  /* First-launch onboarding gate. Opens once on a browser that has never
     completed or skipped the wizard (tracked via the `onboarded` setting).
     Owned here as local state — like the other standalone modals — so the
     wizard can render inside <AgentSpawnProvider> and reach the spawn
     context for provider setup + the first launch. */
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const closeOnboarding = useCallback(() => setOnboardingOpen(false), []);

  // Global hotkeys registered at the App level. Compose owns shortcuts that
  // need compose state or an anchor element.
  const hotkeys = useMemo(
    () => ({
      "$mod+k": (): void => {
        openModal("cmdk");
      },
    }),
    [openModal],
  );
  useHotkeys(hotkeys);

  useEffect(() => {
    setToken(readTokenFromQuery());
  }, [setToken]);

  // First launch: open onboarding once if this browser has never been through
  // it. `readOnboarded()` latches true on finish/skip so it never re-fires.
  useEffect(() => {
    if (!readOnboarded()) setOnboardingOpen(true);
  }, []);

  useEffect(() => {
    const client = createClient({ baseUrl: "", token });
    const managedClient = createManagedAgentsClient({ baseUrl: "", token });
    void (async () => {
      /* Read multi-path state first so the rest of the bootstrap knows
         which path to scope sessions/participants to. Kernels prior to
         v0.5 don't expose /paths — treat any error here as "no path
         state", and fall through to the legacy sessions/participants
         fetch so the renderer keeps working against an old kernel. */
      let activePath: string | null = null;
      let activePathId: string | null = null;
      try {
        const paths = await client.getPaths();
        setPathsState(paths);
        activePath = paths.activePath;
        activePathId = paths.activePathId;
      } catch {
        /* legacy kernel; behave as if cwd is active */
        activePath = "";
      }

      if (activePath === null) {
        /* No active path → empty state. Don't try to list sessions or
           participants — the kernel would 409 on the multi-path-aware
           routes. */
        setSessions([]);
        setParticipants({});
        return;
      }

      let list: Awaited<ReturnType<typeof client.listSessions>> = [];
      let participants: Awaited<ReturnType<typeof client.listParticipants>> = {};
      try {
        [list, participants] = await Promise.all([
          client.listSessions(),
          client.listParticipants(),
        ]);
      } catch {
        /* swallow — leave list/participants empty */
      }
      setSessions(list);
      setParticipants(participants);
      const state = useStore.getState();
      if (list.length > 0 && state.currentSessionId === null) {
        const saved = persistedLastFocusedSession(activePathId, activePath);
        if (saved !== null && list.some((session) => session.id === saved)) {
          setCurrentSession(saved);
        } else {
          if (saved !== null) {
            clearPersistedLastFocusedSession(activePathId, activePath);
          }
          setCurrentSession(list[0]!.id);
        }
      }
    })();

    /* Fetch managed-agent state and the env probe in parallel. Both are
       best-effort — if either fails (e.g. kernel without these endpoints
       in dev) the renderer continues to function, just without the
       chip/banner data. We tolerate partial / malformed responses so a
       mock kernel returning `{}` doesn't crash the chip strip. */
    void (async () => {
      let processApiEnabled: boolean | null = null;
      try {
        const health = await client.health();
        processApiEnabled = health.processApiEnabled ?? null;
      } catch {
        /* Older kernels still support the managed-agent probe below. */
      }
      if (processApiEnabled === false) {
        setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
        return;
      }
      try {
        const r = await managedClient.list();
        if (Array.isArray(r?.agents)) setManagedAgents(r.agents);
        if (Array.isArray(r?.terminals)) setManagedTerminals(r.terminals);
        setManagedAgentsDisabledReason(null);
      } catch (err) {
        if (isProcessApiDisabledError(err)) {
          setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
        }
      }
    })();
    void (async () => {
      try {
        const r = await managedClient.envProbe();
        if (
          r !== null &&
          typeof r === "object" &&
          "runtimes" in r &&
          typeof (r as { runtimes: unknown }).runtimes === "object"
        ) {
          setEnvProbe(r);
        }
      } catch {
        /* swallow */
      }
    })();
  }, [
    token,
    setSessions,
    setParticipants,
    setCurrentSession,
    setManagedAgents,
    setManagedTerminals,
    setManagedAgentsDisabledReason,
    setEnvProbe,
    setPathsState,
  ]);

  useEffect(() => {
    if (currentSessionId === null) return;
    const client = createClient({ baseUrl: "", token });
    const sessionId = currentSessionId;
    const pathId = activePathId;
    const revision = activeRevision;
    const selectedSession = sessions.find((session) => session.id === sessionId);
    const eventPath = selectedSession?.path ?? activePath ?? undefined;
    let cancelled = false;
    void (async () => {
      try {
        const events = await client.listEvents(sessionId, {
          ...(eventPath !== undefined ? { path: eventPath } : {}),
        });
        const state = useStore.getState();
        if (
          !cancelled &&
          state.currentSessionId === sessionId &&
          state.activePathId === pathId &&
          state.activeRevision === revision &&
          (state.sessions.find((session) => session.id === sessionId)?.path ??
            state.activePath ??
            undefined) === eventPath
        ) {
          setEvents(events);
        }
      } catch {
        // Do not clear events on a failed fetch. A path switch can leave an
        // old request racing a new one; the next matching request repopulates.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    currentSessionId,
    sessions,
    activePath,
    activePathId,
    activeRevision,
    token,
    setEvents,
  ]);

  useEffect(() => {
    /* Single long-lived WS subscription gated on token only. Inside, we read
       currentSessionId via useStore.getState() so a session switch doesn't
       force a reconnect (which used to drop messages mid-switch and miss
       path-switched broadcasts entirely). */
    const ws = connectWs({ baseUrl: "", token }, async (m) => {
      if (m.type === "path-switched") {
        /* Kernel announced an active-path change (could be from another
           tab, the +New modal in this tab, or a topbar PathSwitcher click).
           Refetch state + sessions + participants, then drop into the new
           path's first session. */
        const client = createClient({ baseUrl: "", token });
        let pathState: Awaited<ReturnType<typeof client.getPaths>> | null = null;
        try {
          pathState = await client.getPaths();
          setPathsState(pathState);
        } catch {
          /* legacy kernel; ignore */
        }
        if (m.activePath === null) {
          setSessions([]);
          setParticipants({});
          setCurrentSession(null);
          return;
        }
        try {
          const [list, parts] = await Promise.all([
            client.listSessions(),
            client.listParticipants(),
          ]);
          setSessions(list);
          setParticipants(parts);
          const current = useStore.getState().currentSessionId;
          const saved = persistedLastFocusedSession(
            pathState?.activePathId ?? null,
            pathState?.activePath ?? m.activePath,
          );
          const nextSession =
            current !== null && list.some((session) => session.id === current)
              ? current
              : saved !== null && list.some((session) => session.id === saved)
                ? saved
              : (list[0]?.id ?? null);
          if (
            saved !== null &&
            nextSession !== saved &&
            !list.some((session) => session.id === saved)
          ) {
            clearPersistedLastFocusedSession(
              pathState?.activePathId ?? null,
              pathState?.activePath ?? m.activePath,
            );
          }
          setCurrentSession(nextSession);
        } catch {
          /* swallow */
        }
        return;
      }

      /* Envelope filter: when the kernel's wrap injected a pathId+revision,
         drop messages that don't match the renderer's current view. This
         closes the "in-flight event from path A delivered after switching
         to path B" race (session ids can collide across paths). When the
         envelope is absent (legacy kernel), pass-through. */
      const store = useStore.getState();
      if (
        "pathId" in m &&
        m.pathId != null &&
        store.activePathId != null &&
        m.pathId !== store.activePathId
      ) {
        return;
      }
      if (
        "revision" in m &&
        typeof m.revision === "number" &&
        m.revision < store.activeRevision
      ) {
        return;
      }

      /* Managed-agent / presence / env-probe messages are session-agnostic
         (they describe global runtime state). */
      if (isManagedAgentMessage(m)) {
        dispatchManagedAgentWsMessage(m);
        return;
      }
      if (m.type === "session.forked") {
        return;
      }
      if (m.type === "files.changed") {
        const activeRoot = useStore.getState().activePath;
        if (activeRoot === null || m.root !== activeRoot) return;
        const client = createClient({ baseUrl: "", token });
        void loadFilesTree(client, activeRoot, { force: true });
        return;
      }

      const sessionId = store.currentSessionId;
      if (sessionId === null) return;
      if (m.session_id !== sessionId) return;
      if (m.type === "event_added") {
        const client = createClient({ baseUrl: "", token });
        try {
          const eventPath =
            store.sessions.find((session) => session.id === sessionId)?.path ??
            store.activePath ??
            undefined;
          const fresh = await client.listEvents(sessionId, {
            ...(eventPath !== undefined ? { path: eventPath } : {}),
          });
          const nextStore = useStore.getState();
          if (nextStore.currentSessionId !== sessionId) return;
          const nextPath =
            nextStore.sessions.find((session) => session.id === sessionId)?.path ??
            nextStore.activePath ??
            undefined;
          if (nextPath !== eventPath) return;
          for (const e of fresh) upsertEvent(e);
        } catch {
          /* stale path/session fetch; a later path/session refresh will catch up */
        }
      }
    });
    return () => ws.close();
  }, [
    token,
    upsertEvent,
    dispatchManagedAgentWsMessage,
    setPathsState,
    setSessions,
    setParticipants,
    setCurrentSession,
  ]);

  const modalCtx = useMemo<TopBarModalContextValue>(
    () => ({
      openTerminalOverlay: (tmuxSession) => setTerminalOverlayFor(tmuxSession),
      openHookInstall: (runtimeId, participantId) =>
        setHookInstallFor({ runtimeId, participantId }),
      openReconnect: (participantId, sessionId, runtimeId) =>
        setReconnectFor({ participantId, sessionId, runtimeId }),
    }),
    [],
  );

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );

  const closeTerminalOverlay = useCallback(
    () => setTerminalOverlayFor(null),
    [],
  );
  const closeHookInstall = useCallback(() => setHookInstallFor(null), []);
  const closeReconnect = useCallback(() => setReconnectFor(null), []);

  /* App-level agent-spawn state. Lifted here so TopBar's `+` menu and the
     empty-session AgentLauncher share the same preflight + setup-modal
     state. Both consume via useAgentSpawnContext(). */
  const agentSpawn = useAgentSpawn();
  const closeIntegrationSetup = useCallback(
    () => agentSpawn.setIntegrationSetupFor(null),
    [agentSpawn],
  );

  /* Empty-session AgentLauncher gating. When a session is active but has
     no events AND no agent participant, render the launcher in place of
     <Feed/> + <Compose/>. Computed here so the JSX below can switch
     atomically without each child duplicating the condition. */
  const showAgentLauncher =
    currentSessionId !== null &&
    events.length === 0 &&
    !Object.values(participants).some(
      (p) => p.kind === "agent" && p.active_session === currentSessionId,
    );

  /* File-viewer layout gating. The same `<FileViewer>` is mounted in
     different positions per the user's chosen layout for this project. */
  const fvActivePath = useStore((s) => s.activePath);
  const fileViewerLayout = useStore((s) =>
    s.activePath !== null
      ? (s.fileViewerLayoutByPath[s.activePath] ??
        DEFAULT_FILE_VIEWER_LAYOUT)
      : DEFAULT_FILE_VIEWER_LAYOUT,
  );
  const fileViewerExtraCollapsed = useStore(
    (s) => s.fileViewerExtraCollapsed,
  );
  const fileViewerModalOpen = useStore((s) => s.fileViewerModalOpen);
  const fileViewerModalDismissed = useStore(
    (s) => s.fileViewerModalDismissed,
  );
  /* Show extra pane only when chosen AND not collapsed. activePath must
     exist (no project = no viewer). */
  const showExtraPane =
    fvActivePath !== null &&
    fileViewerLayout === "extra" &&
    !fileViewerExtraCollapsed;
  const showCollapsedExtraButton =
    fvActivePath !== null &&
    fileViewerLayout === "extra" &&
    fileViewerExtraCollapsed;
  const showFileModal =
    fvActivePath !== null &&
    fileViewerLayout === "modal" &&
    fileViewerModalOpen;
  const showModalReopen =
    fvActivePath !== null &&
    fileViewerLayout === "modal" &&
    !fileViewerModalOpen &&
    fileViewerModalDismissed;
  const useReplaceChatShell =
    fvActivePath !== null && fileViewerLayout === "replace-chat";

  /* Shell placement (Settings → Appearance → Pane arrangement). The active
     placement keys the generated grid rule on `.main`; the per-session pane
     sizes become CSS vars the generated tracks reference. */
  const placement = useShellPlacement();
  const currentSizes = useStore((s) =>
    s.currentSessionId !== null
      ? (s.panelSizeBySession[s.currentSessionId] ?? null)
      : null,
  );
  const sizes = currentSizes ?? defaultPaneSizes();
  const mainStyle: Record<string, string> = {
    [widthVar("leftPanel")]: `${sizes.leftPanel.width}px`,
    [heightVar("leftPanel")]: `${sizes.leftPanel.height}px`,
    [widthVar("rightPanel")]: `${sizes.rightPanel.width}px`,
    [heightVar("rightPanel")]: `${sizes.rightPanel.height}px`,
  };

  /* Resolve a base URL string for modals that need to derive ws:// or
     fetch raw markdown. Empty in dev — same-origin proxying handles it. */
  const baseUrl = "";

  return (
    <TopBarModalContext.Provider value={modalCtx}>
      <AgentSpawnProvider value={agentSpawn}>
        <div className="app">
          <TopBar />
          <div
            className="main"
            data-shell-layout={placementKey(placement)}
            style={mainStyle as CSSProperties}
          >
            <LeftRail />
            <LeftPanel />
            <div className="chat-region">
              {showAgentLauncher ? (
                <AgentLauncher />
              ) : (
                <section className="feed-col" aria-label="Feed">
                  {useReplaceChatShell ? (
                    <ReplaceChatShell />
                  ) : (
                    <>
                      <Feed />
                      <div className="compose">
                        <Compose />
                      </div>
                    </>
                  )}
                </section>
              )}
              {showExtraPane ? <ExtraPaneShell /> : null}
            </div>
            <RightPanel />
          </div>
          {showCollapsedExtraButton ? <CollapsedExtraButton /> : null}
          {showFileModal ? <ModalShell /> : null}
          {showModalReopen ? <ModalReopenButton /> : null}
          <FilesTreePreloader />
          <ModalRoot />
        {terminalOverlayFor !== null ? (
          <Suspense fallback={null}>
            <TerminalOverlay
              tmuxSession={terminalOverlayFor}
              token={token}
              baseUrl={baseUrl}
              onClose={closeTerminalOverlay}
            />
          </Suspense>
        ) : null}
        {hookInstallFor !== null ? (
          <HookInstallModal
            runtimeId={hookInstallFor.runtimeId}
            participantId={hookInstallFor.participantId}
            userParticipantId={currentUserId ?? undefined}
            apiClient={apiClient}
            onClose={closeHookInstall}
          />
        ) : null}
        {reconnectFor !== null ? (
          <ReconnectModal
            participantId={reconnectFor.participantId}
            sessionId={reconnectFor.sessionId}
            runtimeId={reconnectFor.runtimeId}
            baseUrl={baseUrl}
            token={token}
            onClose={closeReconnect}
          />
        ) : null}
        {agentSpawn.integrationSetupFor !== null ? (
          <IntegrationSetupModal
            runtimeId={agentSpawn.integrationSetupFor.runtimeId}
            participantId={agentSpawn.integrationSetupFor.participantId}
            sessionId={currentSessionId ?? undefined}
            suggestedName={agentSpawn.integrationSetupFor.suggestedName}
            accessMode={agentSpawn.accessModeForRuntime(
              agentSpawn.integrationSetupFor.runtimeId,
            )}
            accessModeOptions={agentSpawn.accessModeOptionsForRuntime(
              agentSpawn.integrationSetupFor.runtimeId,
            )}
            onAccessModeChange={(mode) =>
              agentSpawn.setAccessModeForRuntime(
                agentSpawn.integrationSetupFor!.runtimeId,
                mode,
              )
            }
            initialPreflight={agentSpawn.integrationSetupFor.preflight}
            apiClient={apiClient}
            onClose={closeIntegrationSetup}
            onLaunched={(resp) => {
              const setup = agentSpawn.integrationSetupFor;
              if (setup === null) return;
              const { suggestedName, color } = setup;
              agentSpawn.setIntegrationSetupFor(null);
              agentSpawn.onSpawnComplete(resp, suggestedName, color);
            }}
          />
        ) : null}
        {onboardingOpen ? (
          <OnboardingModal onClose={closeOnboarding} />
        ) : null}
        </div>
      </AgentSpawnProvider>
    </TopBarModalContext.Provider>
  );
}

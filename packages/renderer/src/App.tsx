import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "./api/client.js";
import { connectWs } from "./api/ws.js";
import { createManagedAgentsClient } from "./api/managedAgents.js";
import { useStore } from "./state/store.js";
import { TopBar } from "./shell/TopBar.js";
import { LeftRail } from "./shell/LeftRail.js";
import { LeftPanel } from "./shell/LeftPanel.js";
import { Feed } from "./shell/Feed.js";
import { RightPanel } from "./shell/RightPanel.js";
import { Compose } from "./shell/Compose.js";
import { ModalRoot } from "./modals/ModalRoot.js";
import { TerminalOverlay } from "./modals/TerminalOverlay.js";
import { HookInstallModal } from "./modals/HookInstallModal.js";
import { ReconnectModal } from "./modals/ReconnectModal.js";
import { useHotkeys } from "./hooks/useHotkeys.js";
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
  openHookInstall(runtimeId: string, participantId: string): void;
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
  const currentSessionId = useStore((s) => s.currentSessionId);
  const currentUserId = useStore((s) => s.currentUserId);
  const openModal = useStore((s) => s.openModal);
  const setManagedAgents = useStore((s) => s.setManagedAgents);
  const setManagedTerminals = useStore((s) => s.setManagedTerminals);
  const setEnvProbe = useStore((s) => s.setEnvProbe);
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
    participantId: string;
  } | null>(null);
  const [reconnectFor, setReconnectFor] = useState<{
    participantId: string;
    sessionId: string;
    runtimeId: string;
  } | null>(null);

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

  useEffect(() => {
    const client = createClient({ baseUrl: "", token });
    const managedClient = createManagedAgentsClient({ baseUrl: "", token });
    void (async () => {
      const [list, participants] = await Promise.all([
        client.listSessions(),
        client.listParticipants(),
      ]);
      setSessions(list);
      setParticipants(participants);
      const state = useStore.getState();
      if (list.length > 0 && state.currentSessionId === null) {
        setCurrentSession(list[0]!.id);
      }
    })();

    /* Fetch managed-agent state and the env probe in parallel. Both are
       best-effort — if either fails (e.g. kernel without these endpoints
       in dev) the renderer continues to function, just without the
       chip/banner data. We tolerate partial / malformed responses so a
       mock kernel returning `{}` doesn't crash the chip strip. */
    void (async () => {
      try {
        const r = await managedClient.list();
        if (Array.isArray(r?.agents)) setManagedAgents(r.agents);
        if (Array.isArray(r?.terminals)) setManagedTerminals(r.terminals);
      } catch {
        /* swallow */
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
    setEnvProbe,
  ]);

  useEffect(() => {
    if (currentSessionId === null) return;
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      const events = await client.listEvents(currentSessionId, {});
      setEvents(events);
    })();
  }, [currentSessionId, token, setEvents]);

  useEffect(() => {
    if (currentSessionId === null) return;
    const ws = connectWs({ baseUrl: "", token }, async (m) => {
      /* Managed-agent / presence / env-probe messages are session-agnostic
         (they describe global runtime state). Dispatch them first; only
         skip session-scoped event_added/superseded messages when the
         session differs. */
      if (isManagedAgentMessage(m)) {
        dispatchManagedAgentWsMessage(m);
        return;
      }
      if (m.session_id !== currentSessionId) return;
      if (m.type === "event_added") {
        const client = createClient({ baseUrl: "", token });
        const fresh = await client.listEvents(currentSessionId, {});
        for (const e of fresh) upsertEvent(e);
      }
    });
    return () => ws.close();
  }, [
    currentSessionId,
    token,
    upsertEvent,
    dispatchManagedAgentWsMessage,
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

  /* Resolve a base URL string for modals that need to derive ws:// or
     fetch raw markdown. Empty in dev — same-origin proxying handles it. */
  const baseUrl = "";

  return (
    <TopBarModalContext.Provider value={modalCtx}>
      <div className="app">
        <TopBar />
        <div className="main">
          <LeftRail />
          <LeftPanel />
          <Feed />
          <RightPanel />
        </div>
        <div className="compose">
          <Compose />
        </div>
        <ModalRoot />
        {terminalOverlayFor !== null ? (
          <TerminalOverlay
            tmuxSession={terminalOverlayFor}
            token={token}
            baseUrl={baseUrl}
            onClose={closeTerminalOverlay}
          />
        ) : null}
        {hookInstallFor !== null && currentUserId !== null ? (
          <HookInstallModal
            runtimeId={hookInstallFor.runtimeId}
            participantId={hookInstallFor.participantId}
            userParticipantId={currentUserId}
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
      </div>
    </TopBarModalContext.Provider>
  );
}

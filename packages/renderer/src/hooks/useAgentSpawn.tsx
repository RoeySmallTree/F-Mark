/* useAgentSpawn — single owner for the renderer's agent-spawn UX.

   Lifted here from TopBar so multiple surfaces (the topbar `+` menu and the
   empty-session AgentLauncher) share the same preflight + IntegrationSetup
   modal state. App.tsx calls this hook once and provides the result via
   AgentSpawnContext; consumers read it with useAgentSpawnContext(). */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import type {
  IntegrationPreflightResponse,
  RuntimeAccessModeOption,
  SpawnResponse,
} from "@f-mark/shared";
import {
  defaultRuntimeAccessMode,
  isOfferableRuntimeId,
  isRuntimeAccessMode,
  runtimeAccessModeOptions,
} from "@f-mark/shared";
import { useStore } from "../state/store.js";
import {
  readAgentAccessMode,
  writeAgentAccessMode,
} from "../state/settings.js";
import {
  createManagedAgentsClient,
  isProcessApiDisabledError,
  PROCESS_API_DISABLED_MESSAGE,
} from "../api/managedAgents.js";
import { createClient } from "../api/client.js";
import { randomAgentColor, randomAgentName } from "../lib/agentNaming.js";
import { KNOWN_RUNTIMES } from "../runtimes.js";

export interface AgentSpawnRuntime {
  id: string;
  displayName: string;
  available: boolean;
}

export interface IntegrationSetupState {
  runtimeId: string;
  participantId: string;
  preflight: IntegrationPreflightResponse;
  suggestedName: string;
  color: string;
}

export interface AgentSpawnValue {
  runtimes: AgentSpawnRuntime[];
  tmuxMissing: boolean;
  spawnDisabledReason: string | null;
  spawnError: string | null;
  integrationSetupFor: IntegrationSetupState | null;
  setIntegrationSetupFor(s: IntegrationSetupState | null): void;
  setSpawnError(s: string | null): void;
  accessModeForRuntime(runtimeId: string): string;
  accessModeOptionsForRuntime(runtimeId: string): RuntimeAccessModeOption[];
  setAccessModeForRuntime(runtimeId: string, mode: string): void;
  onSpawnRuntime(runtimeId: string): void;
  onConfigureRuntime(runtimeId: string): void;
  onManageRuntimes(): void;
  onSpawnComplete(resp: SpawnResponse, name: string, color: string): void;
}

function randomHex(bytes: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return Math.floor(Math.random() * 16 ** (bytes * 2))
    .toString(16)
    .padStart(bytes * 2, "0");
}

function suggestedParticipantId(runtimeId: string): string {
  const safeRuntime = runtimeId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `ag-${safeRuntime.length > 0 ? safeRuntime : "agent"}-${randomHex(2)}`;
}

function shouldLaunchFromPreflight(preflight: IntegrationPreflightResponse): boolean {
  if (!preflight.runtime.available) return false;
  if (preflight.mcp.status === "blocked" || preflight.mcp.status === "stale") {
    return false;
  }
  if (preflight.mcp.status === "missing") return false;
  if (preflight.hooks.status === "blocked") return false;
  if (preflight.hooks.status === "missing" || preflight.hooks.status === "stale") {
    return false;
  }
  return true;
}

function normalizeAccessMode(runtimeId: string, mode: string): string {
  if (mode === "default") return mode;
  if (isRuntimeAccessMode(runtimeId, mode)) return mode;
  return defaultRuntimeAccessMode(runtimeId);
}

export function useAgentSpawn(): AgentSpawnValue {
  const token = useStore((s) => s.token);
  const envProbe = useStore((s) => s.envProbe);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const managedAgentsDisabledReason = useStore(
    (s) => s.managedAgentsDisabledReason,
  );
  const setManagedAgentsDisabledReason = useStore(
    (s) => s.setManagedAgentsDisabledReason,
  );
  const addManagedAgent = useStore((s) => s.addManagedAgent);
  const upsertParticipant = useStore((s) => s.upsertParticipant);
  const setPresence = useStore((s) => s.setPresence);
  const openSettings = useStore((s) => s.openSettings);

  const [integrationSetupFor, setIntegrationSetupFor] =
    useState<IntegrationSetupState | null>(null);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [accessModesByRuntime, setAccessModesByRuntime] = useState<
    Record<string, string>
  >({});

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const restClient = useMemo(() => createClient({ baseUrl: "", token }), [token]);

  const probeRuntimes = useMemo<Record<string, boolean> | null>(() => {
    if (envProbe === null) return null;
    const r = (envProbe as { runtimes?: Record<string, boolean> }).runtimes;
    if (r === undefined || r === null) return null;
    return r;
  }, [envProbe]);

  const runtimes = useMemo<AgentSpawnRuntime[]>(() => {
    const ids = new Set([
      ...Object.keys(KNOWN_RUNTIMES),
      ...(probeRuntimes !== null
        ? Object.keys(probeRuntimes).filter(isOfferableRuntimeId)
        : []),
    ]);
    return [...ids].map((id) => ({
      id,
      displayName: KNOWN_RUNTIMES[id]?.displayName ?? id,
      available: probeRuntimes !== null ? probeRuntimes[id] !== false : true,
    }));
  }, [probeRuntimes]);

  const tmuxMissing = envProbe !== null && envProbe.tmux === false;
  const spawnDisabledReason = managedAgentsDisabledReason;

  const accessModeForRuntime = useCallback(
    (runtimeId: string): string => {
      const fallback = defaultRuntimeAccessMode(runtimeId);
      return normalizeAccessMode(
        runtimeId,
        accessModesByRuntime[runtimeId] ??
          readAgentAccessMode(runtimeId, fallback),
      );
    },
    [accessModesByRuntime],
  );

  const accessModeOptionsForRuntime = useCallback(
    (runtimeId: string): RuntimeAccessModeOption[] =>
      runtimeAccessModeOptions(runtimeId),
    [],
  );

  const setAccessModeForRuntime = useCallback(
    (runtimeId: string, mode: string): void => {
      const normalized = normalizeAccessMode(runtimeId, mode);
      setAccessModesByRuntime((prev) => ({
        ...prev,
        [runtimeId]: normalized,
      }));
      writeAgentAccessMode(runtimeId, normalized);
    },
    [],
  );

  const onSpawnComplete = useCallback(
    (resp: SpawnResponse, suggestedName: string, color: string) => {
      addManagedAgent({
        participant_id: resp.participant_id,
        tmux_session: resp.tmux_session,
        runtime_id: resp.runtime_id,
      });
      upsertParticipant(resp.participant_id, {
        kind: "agent",
        name: suggestedName,
        color,
        active_session: resp.active_session,
        runtime_id: resp.runtime_id,
      });
      void restClient
        .updateParticipant(resp.participant_id, { color })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("failed to persist agent color", err);
        });
      const presenceState =
        resp.hooks_status === "installed"
          ? "stale"
          : resp.hooks_status === "not_required"
            ? "stale"
            : resp.hooks_status === "missing"
              ? "hook-not-installed"
              : "launching";
      setPresence(resp.participant_id, {
        state: presenceState,
        last_hook_at: null,
      });
    },
    [addManagedAgent, upsertParticipant, setPresence, restClient],
  );

  const onSpawnRuntime = useCallback(
    (runtimeId: string) => {
      setSpawnError(null);
      setIntegrationSetupFor(null);
      if (managedAgentsDisabledReason !== null) {
        setSpawnError(managedAgentsDisabledReason);
        return;
      }
      void (async () => {
        try {
          const participantId = suggestedParticipantId(runtimeId);
          const suggestedName = randomAgentName();
          const color = randomAgentColor();
          const accessMode = accessModeForRuntime(runtimeId);
          const preflight = await apiClient.preflight({
            runtime_id: runtimeId,
            participant_id: participantId,
          });
          if (!shouldLaunchFromPreflight(preflight)) {
            setIntegrationSetupFor({
              runtimeId,
              participantId,
              preflight,
              suggestedName,
              color,
            });
            return;
          }
          const resp = await apiClient.spawn({
            runtime_id: runtimeId,
            session_id: currentSessionId ?? undefined,
            suggested_participant_id: participantId,
            name: suggestedName,
            access_mode: accessMode,
          });
          onSpawnComplete(resp, suggestedName, color);
        } catch (e: unknown) {
          if (isProcessApiDisabledError(e)) {
            setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
            setSpawnError(PROCESS_API_DISABLED_MESSAGE);
          } else {
            setSpawnError(e instanceof Error ? e.message : String(e));
          }
          // eslint-disable-next-line no-console
          console.error("spawn failed", e);
        }
      })();
    },
    [
      apiClient,
      accessModeForRuntime,
      currentSessionId,
      managedAgentsDisabledReason,
      onSpawnComplete,
      setManagedAgentsDisabledReason,
    ],
  );

  /* Force-open the integration setup modal regardless of preflight state.
     Used by the empty-state AgentLauncher's "Configure" button, which lets
     the user inspect/override what will be installed before launch. */
  const onConfigureRuntime = useCallback(
    (runtimeId: string) => {
      setSpawnError(null);
      if (managedAgentsDisabledReason !== null) {
        setSpawnError(managedAgentsDisabledReason);
        return;
      }
      void (async () => {
        try {
          const participantId = suggestedParticipantId(runtimeId);
          const suggestedName = randomAgentName();
          const color = randomAgentColor();
          const preflight = await apiClient.preflight({
            runtime_id: runtimeId,
            participant_id: participantId,
          });
          setIntegrationSetupFor({
            runtimeId,
            participantId,
            preflight,
            suggestedName,
            color,
          });
        } catch (e: unknown) {
          if (isProcessApiDisabledError(e)) {
            setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
            setSpawnError(PROCESS_API_DISABLED_MESSAGE);
          } else {
            setSpawnError(e instanceof Error ? e.message : String(e));
          }
        }
      })();
    },
    [apiClient, managedAgentsDisabledReason, setManagedAgentsDisabledReason],
  );

  const onManageRuntimes = useCallback(() => {
    openSettings("runtimes");
  }, [openSettings]);

  return {
    runtimes,
    tmuxMissing,
    spawnDisabledReason,
    spawnError,
    integrationSetupFor,
    setIntegrationSetupFor,
    setSpawnError,
    accessModeForRuntime,
    accessModeOptionsForRuntime,
    setAccessModeForRuntime,
    onSpawnRuntime,
    onConfigureRuntime,
    onManageRuntimes,
    onSpawnComplete,
  };
}

const AgentSpawnContext = createContext<AgentSpawnValue | null>(null);

export function AgentSpawnProvider({
  value,
  children,
}: {
  value: AgentSpawnValue;
  children: ReactNode;
}): JSX.Element {
  return (
    <AgentSpawnContext.Provider value={value}>{children}</AgentSpawnContext.Provider>
  );
}

export function useAgentSpawnContext(): AgentSpawnValue {
  const ctx = useContext(AgentSpawnContext);
  if (ctx === null) {
    throw new Error(
      "useAgentSpawnContext must be called inside <AgentSpawnProvider>",
    );
  }
  return ctx;
}

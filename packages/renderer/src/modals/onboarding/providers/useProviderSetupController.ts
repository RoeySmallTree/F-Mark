import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createManagedAgentsClient } from "../../../api/managedAgents.js";
import type { AgentSpawnRuntime } from "../../../hooks/useAgentSpawn.js";
import { randomAgentColor, randomAgentName } from "../../../lib/agentNaming.js";
import {
  genParticipantId,
  type AgentIdentity,
} from "../types.js";
import {
  EMPTY_RUNTIME_STATUS,
  type RuntimeStatus,
  type Scope,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  codex: "codex",
  project: "project",
  user: "user",
} as const;

function scopeFromPreflight(runtimeId: string, scope: string): Scope {
  if (runtimeId === NO_LOOSE_STRING_VALUES.codex) {
    return NO_LOOSE_STRING_VALUES.user;
  }
  return scope === NO_LOOSE_STRING_VALUES.user
    ? NO_LOOSE_STRING_VALUES.user
    : NO_LOOSE_STRING_VALUES.project;
}

export function useProviderSetupController({
  token,
  runtimes,
  disabledReason,
  chosenRuntimeId,
  modelForRuntime,
  effortForRuntime,
  onChoose,
}: {
  token: string | null;
  runtimes: AgentSpawnRuntime[];
  disabledReason: string | null;
  chosenRuntimeId: string | null;
  modelForRuntime(runtimeId: string): string;
  effortForRuntime(runtimeId: string): string;
  onChoose(
    runtimeId: string,
    identity: AgentIdentity,
    defaults?: { model: string; effort: string },
  ): void;
}) {
  const client = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const identities = useRef<Record<string, AgentIdentity>>({});
  const scopeTouched = useRef(false);
  const [scope, setScope] = useState<Scope>(NO_LOOSE_STRING_VALUES.user);
  const [statuses, setStatuses] = useState<Record<string, RuntimeStatus>>({});

  const setChosenScope = useCallback((next: Scope): void => {
    scopeTouched.current = true;
    setScope(next);
  }, []);

  const ensureIdentity = useCallback((runtimeId: string): AgentIdentity => {
    const existing = identities.current[runtimeId];
    if (existing !== undefined) return existing;
    const identity: AgentIdentity = {
      participantId: genParticipantId(runtimeId),
      name: randomAgentName(),
      color: randomAgentColor(),
    };
    identities.current[runtimeId] = identity;
    return identity;
  }, []);

  const runPreflight = useCallback(
    async (runtimeId: string): Promise<void> => {
      const identity = ensureIdentity(runtimeId);
      setStatuses((s) => ({
        ...s,
        [runtimeId]: {
          ...(s[runtimeId] ?? EMPTY_RUNTIME_STATUS),
          loading: true,
          error: null,
        },
      }));
      try {
        const preflight = await client.preflight({
          runtime_id: runtimeId,
          participant_id: identity.participantId,
        });
        if (!scopeTouched.current) {
          setScope(scopeFromPreflight(runtimeId, preflight.chosen_scope));
        }
        setStatuses((s) => ({
          ...s,
          [runtimeId]: {
            loading: false,
            applying: false,
            preflight,
            error: null,
          },
        }));
      } catch (e) {
        setStatuses((s) => ({
          ...s,
          [runtimeId]: {
            loading: false,
            applying: false,
            preflight: null,
            error: e instanceof Error ? e.message : String(e),
          },
        }));
      }
    },
    [client, ensureIdentity],
  );

  const apply = useCallback(
    async (runtimeId: string): Promise<void> => {
      const identity = ensureIdentity(runtimeId);
      setStatuses((s) => ({
        ...s,
        [runtimeId]: {
          ...(s[runtimeId] ?? EMPTY_RUNTIME_STATUS),
          applying: true,
          error: null,
        },
      }));
      try {
        const applied = await client.integrationApply({
          runtime_id: runtimeId,
          participant_id: identity.participantId,
          scope,
        });
        setStatuses((s) => ({
          ...s,
          [runtimeId]: {
            loading: false,
            applying: false,
            preflight: applied,
            error: null,
          },
        }));
      } catch (e) {
        setStatuses((s) => ({
          ...s,
          [runtimeId]: {
            ...(s[runtimeId] ?? EMPTY_RUNTIME_STATUS),
            applying: false,
            error: e instanceof Error ? e.message : String(e),
          },
        }));
      }
    },
    [client, scope, ensureIdentity],
  );

  useEffect(() => {
    if (chosenRuntimeId === NO_LOOSE_STRING_VALUES.codex) {
      setScope(NO_LOOSE_STRING_VALUES.user);
    }
  }, [chosenRuntimeId]);

  useEffect(() => {
    if (disabledReason !== null) return;
    for (const r of runtimes) {
      if (r.available) void runPreflight(r.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimes, scope, disabledReason]);

  useEffect(() => {
    if (chosenRuntimeId !== null || disabledReason !== null) return;
    const first = runtimes.find((r) => r.available);
    if (first !== undefined) {
      onChoose(first.id, ensureIdentity(first.id), {
        model: modelForRuntime(first.id),
        effort: effortForRuntime(first.id),
      });
    }
  }, [
    runtimes,
    chosenRuntimeId,
    disabledReason,
    onChoose,
    ensureIdentity,
    modelForRuntime,
    effortForRuntime,
  ]);

  return {
    scope,
    setScope: setChosenScope,
    statuses,
    ensureIdentity,
    defaultsForRuntime: (runtimeId: string) => ({
      model: modelForRuntime(runtimeId),
      effort: effortForRuntime(runtimeId),
    }),
    apply,
  };
}

import { useEffect, useMemo, useState } from "react";
import type { IntegrationLocation, IntegrationPreflightResponse } from "@f-mark/shared";
import { scopeToBody } from "../../api/rootScope.js";
import {
  IntegrationSetupViewModel,
  locationIssue,
  needsActionStatus,
  scopeForTab,
  setupTabForScope,
  tabLabel,
} from "./model.js";
import type {
  BusyState,
  IntegrationSetupModalProps,
  SetupTab,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  default: "default",
  global: "global",
  preflight: "preflight",
  launch: "launch",
  apply: "apply",
  blocked: "blocked",
  unsupported: "unsupported",
} as const;

export interface IntegrationSetupController {
  preflight: IntegrationPreflightResponse | null;
  setupTab: SetupTab;
  busy: BusyState;
  error: string | null;
  view: IntegrationSetupViewModel;
  setSetupTab(tab: SetupTab): void;
  launch(): Promise<void>;
  setupActionFor(
    title: "MCP" | "Hook",
    location: IntegrationLocation | null,
  ): (() => void) | null;
  showRuntimeIssue(): void;
}

export function useIntegrationSetupController({
  runtimeId,
  participantId,
  sessionId,
  suggestedName,
  rootScope = null,
  accessMode = NO_LOOSE_STRING_VALUES.default,
  model = "",
  effort = "",
  initialPreflight,
  apiClient,
  onLaunched,
}: IntegrationSetupModalProps): IntegrationSetupController {
  const [preflight, setPreflight] =
    useState<IntegrationPreflightResponse | null>(initialPreflight ?? null);
  const [setupTab, setSetupTab] = useState<SetupTab>(
    initialPreflight !== undefined
      ? setupTabForScope(initialPreflight.chosen_scope)
      : NO_LOOSE_STRING_VALUES.global,
  );
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);
  const view = useMemo(
    () => new IntegrationSetupViewModel(preflight, setupTab, busy),
    [busy, preflight, setupTab],
  );

  useEffect(() => {
    let alive = true;
    if (initialPreflight !== undefined) {
      setPreflight(initialPreflight);
      setSetupTab(setupTabForScope(initialPreflight.chosen_scope));
      return () => {
        alive = false;
      };
    }
    setBusy(NO_LOOSE_STRING_VALUES.preflight);
    setError(null);
    apiClient
      .preflight({
        runtime_id: runtimeId,
        participant_id: participantId,
        ...(rootScope !== null ? scopeToBody(rootScope) : {}),
      })
      .then((response) => {
        if (alive) {
          setPreflight(response);
          setSetupTab(setupTabForScope(response.chosen_scope));
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setBusy(null);
      });
    return () => {
      alive = false;
    };
  }, [apiClient, initialPreflight, participantId, rootScope, runtimeId]);

  async function launch(): Promise<void> {
    setBusy(NO_LOOSE_STRING_VALUES.launch);
    setError(null);
    try {
      const spawnRequest = {
        runtime_id: runtimeId,
        session_id: sessionId,
        ...(rootScope !== null ? scopeToBody(rootScope) : {}),
        suggested_participant_id: participantId,
        name: suggestedName,
        access_mode: accessMode,
        ...(model.length > 0 ? { model } : {}),
        ...(effort.length > 0 ? { effort } : {}),
        scope: scopeForTab(setupTab),
      };
      const spawned = await apiClient.spawn(spawnRequest);
      onLaunched(spawned);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function applySelectedSetup(): Promise<void> {
    if (preflight === null) return;
    setBusy(NO_LOOSE_STRING_VALUES.apply);
    setError(null);
    try {
      const applied = await apiClient.integrationApply({
        runtime_id: runtimeId,
        participant_id: participantId,
        scope: scopeForTab(setupTab),
        ...(rootScope !== null ? scopeToBody(rootScope) : {}),
      });
      setPreflight(applied);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function showRuntimeIssue(): void {
    if (preflight === null) return;
    const reason =
      preflight.runtime.reason !== undefined && preflight.runtime.reason.length > 0
        ? preflight.runtime.reason
        : `${preflight.runtime.executable} is not reachable from the F-Mark process.`;
    setError(`Runtime: ${reason}`);
  }

  function setupActionFor(
    title: "MCP" | "Hook",
    location: IntegrationLocation | null,
  ): (() => void) | null {
    if (location === null) {
      return () =>
        setError(`${title}: no ${tabLabel(setupTab)} setup target was found.`);
    }
    if (needsActionStatus(location.status) && view.canApply) {
      return () => {
        void applySelectedSetup();
      };
    }
    if (needsActionStatus(location.status) && preflight?.runtime.available !== true) {
      return showRuntimeIssue;
    }
    if (location.status === NO_LOOSE_STRING_VALUES.blocked || location.status === NO_LOOSE_STRING_VALUES.unsupported) {
      return () => setError(locationIssue(title, location, setupTab));
    }
    if (needsActionStatus(location.status)) {
      return () => setError(locationIssue(title, location, setupTab));
    }
    return null;
  }

  return {
    preflight,
    setupTab,
    busy,
    error,
    view,
    setSetupTab,
    launch,
    setupActionFor,
    showRuntimeIssue,
  };
}

import { useMemo, useState } from "react";
import { createClient } from "../../../api/client.js";
import { createManagedAgentsClient } from "../../../api/managedAgents.js";
import { useCurrentSessionRootScopeBinding } from "../../../hooks/useCurrentSessionRootScope.js";
import { useAgentStatusList } from "./rightAgentsController/useAgentStatusList.js";
import { useBusyRunner } from "./rightAgentsController/useBusyRunner.js";
import { useControlActions } from "./rightAgentsController/useControlActions.js";
import { useGoodbyeAction } from "./rightAgentsController/useGoodbyeAction.js";
import { useIdentityActions } from "./rightAgentsController/useIdentityActions.js";
import { useRightAgentsStoreBindings } from "./rightAgentsController/storeBindings.js";
import { useRuntimeActions } from "./rightAgentsController/useRuntimeActions.js";
import { useRuntimeOptions } from "./rightAgentsController/useRuntimeOptions.js";
import type { RenameDraft, RightAgentsController } from "./types.js";

export function useRightAgentsController(): RightAgentsController {
  const bindings = useRightAgentsStoreBindings();
  /* Control routes target the agent's OWN project. The agents shown here are
     scoped to the current session (api.status(currentSessionId)), so the
     session's root scope is the right scope to send with each control call. */
  const { scope: currentScope, scopeKey } = useCurrentSessionRootScopeBinding(
    bindings.currentSessionId,
  );
  const api = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token: bindings.token }),
    [bindings.token],
  );
  const restApi = useMemo(
    () => createClient({ baseUrl: "", token: bindings.token }),
    [bindings.token],
  );
  const [editing, setEditing] = useState<RenameDraft | null>(null);
  const [pickingColorFor, setPickingColorFor] = useState<string | null>(null);

  const status = useAgentStatusList({
    api,
    currentSessionId: bindings.currentSessionId,
    currentScope,
    scopeKey,
  });
  const runner = useBusyRunner({
    refresh: status.refresh,
    setError: status.setError,
  });
  const runtimeOptionsState = useRuntimeOptions(api, currentScope, status.setError);

  const identityActions = useIdentityActions({
    api,
    restApi,
    currentScope,
    participants: bindings.participants,
    upsertParticipant: bindings.upsertParticipant,
    run: runner.run,
    setPickingColorFor,
  });
  const runtimeActions = useRuntimeActions({ api, currentScope, run: runner.run });
  const controlActions = useControlActions({ api, currentScope, run: runner.run });
  const goodbyeAction = useGoodbyeAction({ api, currentScope, run: runner.run });

  return {
    agents: status.agents,
    removedAgents: status.removedAgents,
    loading: status.loading,
    error: status.error,
    busy: runner.busy,
    editing,
    pickingColorFor,
    runtimeOptions: runtimeOptionsState.runtimeOptions,
    runtimeOptionsLoading: runtimeOptionsState.runtimeOptionsLoading,
    participants: bindings.participants,
    events: bindings.events,
    currentScope,
    setEditing,
    setPickingColorFor,
    refresh: status.refresh,
    loadRuntimeOptions: runtimeOptionsState.loadRuntimeOptions,
    ...identityActions,
    ...runtimeActions,
    ...controlActions,
    ...goodbyeAction,
  };
}

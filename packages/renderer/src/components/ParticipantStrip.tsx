import { useCallback, useMemo } from "react";
import { PRESENCE_STATES } from "@f-mark/shared";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { useConfirmDestructive } from "../confirm/index.js";
import { useAgentSpawnContext } from "../hooks/useAgentSpawn.js";
import { ParticipantStripActions } from "./participantStrip/ParticipantStripActions.js";
import { ParticipantStripScroll } from "./participantStrip/ParticipantStripScroll.js";
import {
  buildAgentChips,
  buildUserParticipants,
} from "./participantStrip/participantData.js";
import { useAgentChipEditorController } from "./participantStrip/useAgentChipEditorController.js";
import { useParticipantStripStore } from "./participantStrip/useParticipantStripStore.js";
import { useScopedAgentStatusSync } from "./participantStrip/scopedAgentStatusSync.js";
import { applyReconnectedAgent } from "./participantStrip/reconnectedAgent.js";
import type {
  ParticipantStripProps,
  ParticipantStripSpawnControls,
} from "./participantStrip/types.js";

const NO_LOOSE_STRING_VALUES = {
  compose: "compose",
  profile: "profile",
  agent: "agent",
} as const;

function noop(): void {
  /* Agent chips now open the runtime popover directly; no secondary menu. */
}

export function ParticipantStrip({
  variant = NO_LOOSE_STRING_VALUES.compose,
  activeAgentIds,
  showGlobalActions = false,
  onOpenSearch,
  onOpenSettings,
  searchLabel = "Open command palette",
}: ParticipantStripProps): JSX.Element {
  const {
    currentSessionId,
    currentScope,
    scopeKey,
    participants,
    events,
    token,
    managedAgents,
    managedAgentsDisabledReason,
    presence,
    addManagedAgent,
    upsertParticipant,
    setPresence,
    removeManagedAgent,
    removePresence,
    currentUserId,
    openSettings,
  } = useParticipantStripStore();

  const {
    runtimes,
    spawnDisabledReason,
    spawnError: runtimeSpawnError,
    accessModeForRuntime,
    accessModeOptionsForRuntime,
    setAccessModeForRuntime,
    modelForRuntime,
    effortForRuntime,
    modelOptionsForRuntime,
    effortOptionsForRuntime,
    setModelForRuntime,
    setEffortForRuntime,
    onSpawnRuntime,
    onManageRuntimes,
  } = useAgentSpawnContext();

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const confirmDestructive = useConfirmDestructive();
  useScopedAgentStatusSync({
    api: apiClient,
    currentSessionId,
    scopeKey,
  });

  const allAgentChips = useMemo(
    () => buildAgentChips({
      participants,
      managedAgents,
      presence,
      currentSessionId,
      events,
      activeAgentIds,
    }),
    [participants, managedAgents, presence, currentSessionId, events, activeAgentIds],
  );

  const userParticipants = useMemo(
    () => buildUserParticipants(participants),
    [participants],
  );

  const chipEditor = useAgentChipEditorController({
    agents: allAgentChips,
    apiClient,
    currentScope,
    onOpenEditor: noop,
  });

  const openProfileSettings = useCallback(() => {
    chipEditor.closeEditor();
    openSettings(NO_LOOSE_STRING_VALUES.profile);
  }, [chipEditor, openSettings]);

  const reconnectAgent = useCallback(
    (agent: (typeof allAgentChips)[number]) => {
      const id = agent.participant_id;
      const previousPresence = presence[id] ?? {
        state: PRESENCE_STATES.offline,
        last_hook_at: null,
      };
      setPresence(id, {
        state: PRESENCE_STATES.launching,
        last_hook_at: previousPresence.last_hook_at,
      });
      void apiClient
        .reconnect(id, currentScope)
        .then((resp) =>
          applyReconnectedAgent(resp.agent, previousPresence.last_hook_at, {
            participants,
            addManagedAgent,
            upsertParticipant,
            setPresence,
          }),
        )
        .catch((err) => {
          setPresence(id, previousPresence);
          console.error("reconnect failed", id, err);
        });
    },
    [
      addManagedAgent,
      apiClient,
      currentScope,
      participants,
      presence,
      setPresence,
      upsertParticipant,
    ],
  );

  const refreshAgents = useCallback(() => {
    if (currentSessionId === null) return;
    void apiClient
      .status(currentSessionId, currentScope)
      .then((resp) => {
        for (const agent of resp.agents) addManagedAgent(agent);
      })
      .catch((err) => console.error("agent refresh failed", err));
  }, [addManagedAgent, apiClient, currentScope, currentSessionId]);

  const clearAgent = useCallback(
    (agent: (typeof allAgentChips)[number]) => {
      void (async () => {
        const intent = await confirmDestructive({
          action: "agent.clear",
          title: `Clear ${agent.name}?`,
          detail: "Discards the agent's conversation context.",
        });
        if (intent === null) return;
        await apiClient
          .clear(agent.participant_id, currentScope)
          .then((resp) => addManagedAgent(resp.agent))
          .catch((err) => console.error("clear failed", agent.participant_id, err));
      })();
    },
    [addManagedAgent, apiClient, confirmDestructive, currentScope],
  );

  const sayGoodbye = useCallback(
    (agent: (typeof allAgentChips)[number]) => {
      const id = agent.participant_id;
      void (async () => {
        const intent = await confirmDestructive({
          action: "agent.goodbye",
          title: `Remove ${agent.name}?`,
          detail: "Ends the agent and its terminal session. This cannot be undone.",
        });
        if (intent === null) return;
        try {
          const token = await apiClient.getConfirmToken(id);
          await apiClient.goodbye(id, token, currentScope, intent);
          removeManagedAgent(id);
          removePresence(id);
          const existing = participants[id];
          if (existing !== undefined && existing.kind === NO_LOOSE_STRING_VALUES.agent) {
            upsertParticipant(id, { ...existing, active_session: null });
          }
          chipEditor.closeEditor();
        } catch (err) {
          console.error("goodbye failed", id, err);
        }
      })();
    },
    [
      apiClient,
      chipEditor,
      confirmDestructive,
      currentScope,
      participants,
      removeManagedAgent,
      removePresence,
      upsertParticipant,
    ],
  );

  const spawnControls: ParticipantStripSpawnControls = {
    runtimes,
    onSpawnRuntime,
    onManageRuntimes,
    accessModeForRuntime,
    accessModeOptionsForRuntime,
    setAccessModeForRuntime,
    modelForRuntime,
    effortForRuntime,
    modelOptionsForRuntime,
    effortOptionsForRuntime,
    setModelForRuntime,
    setEffortForRuntime,
    spawnDisabledReason,
    runtimeSpawnError,
    managedAgentsDisabledReason,
  };

  return (
    <div className={`participant-strip participant-strip-${variant}`} title="Participants">
      <ParticipantStripScroll
        agents={allAgentChips}
        userParticipants={userParticipants}
        activeAgentIds={activeAgentIds}
        participants={participants}
        presence={presence}
        currentUserId={currentUserId}
        spawnControls={spawnControls}
        chipEditor={chipEditor}
        onAgentReconnect={reconnectAgent}
        onAgentRefresh={refreshAgents}
        onAgentClear={clearAgent}
        onAgentGoodbye={sayGoodbye}
        onOpenProfileSettings={openProfileSettings}
      />
      <ParticipantStripActions
        visible={showGlobalActions}
        onOpenSearch={onOpenSearch}
        onOpenSettings={onOpenSettings}
        searchLabel={searchLabel}
      />
    </div>
  );
}

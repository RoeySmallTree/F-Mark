import { useRef, useState } from "react";
import type { Participant } from "@f-mark/shared";
import { AgentChip } from "../AgentChip.js";
import { ParticipantAvatar } from "../ParticipantAvatar.js";
import { PlusButton } from "../PlusButton.js";
import { useFlipReorder } from "../../hooks/useFlipReorder.js";
import { openAgentTerminalPane } from "../../state/terminalPaneState.js";
import type { AgentPresence } from "../../state/presence.js";
import { AgentChipEditorPopover } from "./AgentChipEditorPopover.js";
import { agentFlipKey } from "./participantData.js";
import type { AgentChipEditorController } from "./useAgentChipEditorController.js";
import type {
  AgentChipModel,
  ParticipantStripSpawnControls,
  UserParticipant,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  offline: "offline",
  lg: "lg",
  you: "You",
  user: "User",
} as const;

interface ParticipantStripScrollProps {
  agents: AgentChipModel[];
  userParticipants: UserParticipant[];
  activeAgentIds?: ReadonlySet<string>;
  participants: Record<string, Participant>;
  presence: Record<string, AgentPresence>;
  currentUserId: string | null;
  spawnControls: ParticipantStripSpawnControls;
  chipEditor: AgentChipEditorController;
  onAgentReconnect(agent: AgentChipModel): void;
  onAgentRefresh(): void;
  onAgentClear(agent: AgentChipModel): void;
  onAgentGoodbye(agent: AgentChipModel): void;
  onOpenProfileSettings(): void;
}

export function ParticipantStripScroll({
  agents,
  userParticipants,
  activeAgentIds,
  participants,
  presence,
  currentUserId,
  spawnControls,
  chipEditor,
  onAgentReconnect,
  onAgentRefresh,
  onAgentClear,
  onAgentGoodbye,
  onOpenProfileSettings,
}: ParticipantStripScrollProps): JSX.Element {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [editorAnchorRect, setEditorAnchorRect] = useState<DOMRect | null>(null);
  const openEditorAgent =
    chipEditor.expandedAgentId === null
      ? null
      : agents.find((agent) => agent.participant_id === chipEditor.expandedAgentId) ?? null;

  useFlipReorder(stripRef, [agentFlipKey(agents, activeAgentIds)]);

  return (
    <div className="participant-strip-scroll" ref={stripRef}>
      {agents.map((agent) => {
        const state = presence[agent.participant_id]?.state ?? NO_LOOSE_STRING_VALUES.offline;
        const active = activeAgentIds?.has(agent.participant_id) ?? false;
        const color = participants[agent.participant_id]?.color ?? null;
        const expanded = chipEditor.expandedAgentId === agent.participant_id;
        return (
          <div
            key={`agent:${agent.participant_id}`}
            data-flip-id={`agent:${agent.participant_id}`}
            className={`agent-chip-anchor${active ? " active-turn" : ""}${expanded ? " expanded" : ""}`}
          >
            <AgentChip
              participantId={agent.participant_id}
              name={agent.name}
              runtimeId={agent.runtime_id}
              state={state}
              color={color}
              active={active}
              accessPending={agent.pendingAccessCount > 0}
              pendingAccessCount={agent.pendingAccessCount}
              runtimeState={agent.runtime_state}
              accessMode={agent.access_mode}
              activityState={agent.activity_state}
              expanded={expanded}
              onClick={(event) => {
                setEditorAnchorRect(event.currentTarget.getBoundingClientRect());
                chipEditor.toggleEditor(agent);
              }}
            />
          </div>
        );
      })}
      {openEditorAgent !== null && editorAnchorRect !== null ? (
        <AgentChipEditorPopover
          agent={openEditorAgent}
          anchorRect={editorAnchorRect}
          values={chipEditor.valuesForAgent(openEditorAgent)}
          options={chipEditor.optionsForAgent(openEditorAgent)}
          onModelChange={(value) => chipEditor.setModel(openEditorAgent, value)}
          onEffortChange={(value) => chipEditor.setEffort(openEditorAgent, value)}
          onAccessModeChange={(value) => chipEditor.setAccessMode(openEditorAgent, value)}
          presenceState={presence[openEditorAgent.participant_id]?.state ?? NO_LOOSE_STRING_VALUES.offline}
          onCompact={() => chipEditor.compact(openEditorAgent)}
          onReconnect={() => onAgentReconnect(openEditorAgent)}
          onOpenTerminal={() => {
            if (openEditorAgent.tmux_session !== null) {
              openAgentTerminalPane(openEditorAgent.tmux_session);
            }
          }}
          onRefresh={onAgentRefresh}
          onClear={() => onAgentClear(openEditorAgent)}
          onSayGoodbye={() => onAgentGoodbye(openEditorAgent)}
          onClose={() => {
            setEditorAnchorRect(null);
            chipEditor.closeEditor();
          }}
        />
      ) : null}
      {userParticipants.map((participant) => {
        const isCurrentUser = participant.id === currentUserId;
        const active = activeAgentIds?.has(participant.id) ?? false;
        const avatar = (
          <ParticipantAvatar
            participantId={participant.id}
            participant={participant}
            size={NO_LOOSE_STRING_VALUES.lg}
            title={`${participant.name} · ${participant.id}`}
          />
        );
        const role = isCurrentUser
          ? NO_LOOSE_STRING_VALUES.you
          : NO_LOOSE_STRING_VALUES.user;
        /* A participant with no name set falls back to "You", which is also
           the role label — so the chip rendered "You You". The eyebrow only
           earns its line when it says something the name does not. */
        const roleAddsMeaning =
          participant.name.trim().toLowerCase() !== role.toLowerCase();
        const chip = (
          <span className={`topbar-user-chip${isCurrentUser ? " current" : ""}`}>
            {avatar}
            <span className="topbar-user-meta" aria-hidden>
              {roleAddsMeaning ? (
                <span className="topbar-user-role">{role}</span>
              ) : null}
              <span className="topbar-user-name">{participant.name}</span>
            </span>
          </span>
        );
        return (
          <div
            key={`user:${participant.id}`}
            data-flip-id={`user:${participant.id}`}
            className={`topbar-user-anchor${active ? " active-turn" : ""}`}
          >
            {isCurrentUser ? (
              <button
                type="button"
                className="topbar-user-button"
                aria-label="Open profile settings"
                title="Open profile settings"
                onClick={onOpenProfileSettings}
              >
                {chip}
              </button>
            ) : (
              <span className="topbar-user-static">{chip}</span>
            )}
          </div>
        );
      })}
      <PlusButton
        runtimes={spawnControls.runtimes}
        onSpawnRuntime={spawnControls.onSpawnRuntime}
        onManageRuntimes={spawnControls.onManageRuntimes}
        accessModeForRuntime={spawnControls.accessModeForRuntime}
        accessModeOptionsForRuntime={spawnControls.accessModeOptionsForRuntime}
        onAccessModeChange={spawnControls.setAccessModeForRuntime}
        modelForRuntime={spawnControls.modelForRuntime}
        effortForRuntime={spawnControls.effortForRuntime}
        modelOptionsForRuntime={spawnControls.modelOptionsForRuntime}
        effortOptionsForRuntime={spawnControls.effortOptionsForRuntime}
        onModelChange={spawnControls.setModelForRuntime}
        onEffortChange={spawnControls.setEffortForRuntime}
        spawnDisabledReason={spawnControls.spawnDisabledReason}
      />
      {spawnControls.spawnDisabledReason !== null ||
      spawnControls.runtimeSpawnError !== null ? (
        <span
          className="topbar-spawn-error"
          role="alert"
          title={
            spawnControls.runtimeSpawnError ??
            spawnControls.spawnDisabledReason ??
            undefined
          }
        >
          {spawnControls.managedAgentsDisabledReason !== null ? "Spawning disabled" : "Spawn failed"}
        </span>
      ) : null}
    </div>
  );
}

import { createPortal } from "react-dom";
import type { RefObject } from "react";
import {
  PRESENCE_STATES,
  type ManagedAgent,
  type Participant,
} from "@f-mark/shared";
import { AgentActionMenu } from "../AgentActionMenu.js";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";
import { useConfirmDestructive } from "../../confirm/index.js";
import type { RootScope } from "../../api/rootScope.js";
import type { AgentPresence } from "../../state/presence.js";
import { openAgentTerminalPane } from "../../state/terminalPaneState.js";
import { applyReconnectedAgent } from "./reconnectedAgent.js";
import type { AgentActionMenuAnchor, AgentChipModel } from "./types.js";

const managedCommandTypes = {
  slash: "slash",
  interrupt: "interrupt",
  message: "message",
} as const;

const managedSlashCommands = {
  compact: "compact",
} as const;

const PARTICIPANT_KINDS = {
  agent: "agent",
} as const;

interface AgentActionMenuPortalProps {
  agent: AgentChipModel | null;
  anchor: AgentActionMenuAnchor | null;
  popoverRef: RefObject<HTMLDivElement>;
  participants: Record<string, Participant>;
  presence: Record<string, AgentPresence>;
  apiClient: ManagedAgentsClient;
  currentScope: RootScope | null;
  addManagedAgent(agent: ManagedAgent): void;
  upsertParticipant(id: string, participant: Participant): void;
  setPresence(id: string, presence: AgentPresence): void;
  removeManagedAgent(id: string): void;
  removePresence(id: string): void;
  closeMenu(): void;
}

export function AgentActionMenuPortal({
  agent,
  anchor,
  popoverRef,
  participants,
  presence,
  apiClient,
  currentScope,
  addManagedAgent,
  upsertParticipant,
  setPresence,
  removeManagedAgent,
  removePresence,
  closeMenu,
}: AgentActionMenuPortalProps): JSX.Element | null {
  const confirmDestructive = useConfirmDestructive();
  if (agent === null || anchor === null) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={`agent-action-menu-popover placement-${anchor.placement}`}
      data-placement={anchor.placement}
      style={{
        top: anchor.top,
        left: anchor.left,
        maxHeight: anchor.maxHeight,
      }}
    >
      <AgentActionMenu
        participantId={agent.participant_id}
        name={agent.name}
        state={presence[agent.participant_id]?.state ?? PRESENCE_STATES.offline}
        managed={agent.isManaged}
        onRename={(newName) => {
          const id = agent.participant_id;
          const existing = participants[id];
          if (existing !== undefined) upsertParticipant(id, { ...existing, name: newName });
          void apiClient.rename(id, { display_name: newName }, currentScope).catch((err) => console.error("rename failed", err));
          closeMenu();
        }}
        onCompact={() => {
          void apiClient.command(
            agent.participant_id,
            {
              type: managedCommandTypes.slash,
              command: managedSlashCommands.compact,
            },
            currentScope,
          ).catch(() => {});
          closeMenu();
        }}
        onSlash={(command) => {
          void apiClient.command(
            agent.participant_id,
            { type: managedCommandTypes.slash, command },
            currentScope,
          ).catch(() => {});
          closeMenu();
        }}
        onInterrupt={() => {
          void apiClient.command(
            agent.participant_id,
            { type: managedCommandTypes.interrupt },
            currentScope,
          ).catch(() => {});
          closeMenu();
        }}
        onMessage={(text) => {
          void apiClient.command(
            agent.participant_id,
            { type: managedCommandTypes.message, text },
            currentScope,
          ).catch(() => {});
          closeMenu();
        }}
        onOpenTerminal={() => {
          if (agent.tmux_session !== null) openAgentTerminalPane(agent.tmux_session);
          closeMenu();
        }}
        onReconnect={() => {
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
          closeMenu();
        }}
        onSayGoodbye={() => {
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
              if (existing !== undefined && existing.kind === PARTICIPANT_KINDS.agent) {
                upsertParticipant(id, { ...existing, active_session: null });
              }
            } catch (err) {
              console.error("goodbye failed", id, err);
            }
          })();
          closeMenu();
        }}
      />
    </div>,
    document.body,
  );
}

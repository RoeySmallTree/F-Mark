/* AgentActionMenu — the action surface that opens when an AgentChip is
   clicked. Rendered by the chip's parent (TopBar in a later task).

   Conditional items (Reconnect, Install hooks, Say goodbye) are omitted
   entirely when their condition is false. The public import path stays here;
   the menu model, actions, and view live under ./agentActionMenu/. */

import type { JSX } from "react";
import type { PresenceState } from "@f-mark/shared";
import { useAgentActionMenuActions } from "./agentActionMenu/actions.js";
import { buildAgentActionMenuModel } from "./agentActionMenu/model.js";
import { AgentActionMenuView } from "./agentActionMenu/view.js";
import "./chips.css";

export interface AgentActionMenuProps {
  participantId: string;
  name: string;
  state: PresenceState;
  managed: boolean;
  onRename(newName: string): void;
  onCompact(): void;
  onSlash(command: string): void;
  onInterrupt(): void;
  onMessage(text: string): void;
  onOpenTerminal(): void;
  onReconnect(): void;
  onInstallHooks?(): void;
  onSayGoodbye(): void;
}

export function AgentActionMenu({
  participantId,
  name,
  state,
  managed,
  onRename,
  onCompact,
  onSlash,
  onInterrupt,
  onMessage,
  onOpenTerminal,
  onReconnect,
  onInstallHooks,
  onSayGoodbye,
}: AgentActionMenuProps): JSX.Element {
  const model = buildAgentActionMenuModel({
    state,
    managed,
    hasInstallHooks: onInstallHooks !== undefined,
  });
  const actions = useAgentActionMenuActions({
    name,
    onRename,
    onSlash,
    onMessage,
    onSayGoodbye,
  });

  return (
    <AgentActionMenuView
      participantId={participantId}
      name={name}
      model={model}
      actions={actions}
      onCompact={onCompact}
      onInterrupt={onInterrupt}
      onOpenTerminal={onOpenTerminal}
      onReconnect={onReconnect}
      onInstallHooks={onInstallHooks}
    />
  );
}

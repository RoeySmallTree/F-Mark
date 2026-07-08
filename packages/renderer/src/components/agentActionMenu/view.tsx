import type { JSX } from "react";
import type {
  AgentActionMenuActions,
  AgentActionMenuModel,
} from "./types.js";
import {
  CompactSection,
  GoodbyeSection,
  InstallHooksSection,
  InterruptSection,
  MessageSection,
  OpenTerminalSection,
  ReconnectSection,
  RenameSection,
  SlashCommandsSection,
} from "./sections.js";

export interface AgentActionMenuViewProps {
  participantId: string;
  name: string;
  model: AgentActionMenuModel;
  actions: AgentActionMenuActions;
  onCompact(): void;
  onInterrupt(): void;
  onOpenTerminal(): void;
  onReconnect(): void;
  onInstallHooks?(): void;
}

export function AgentActionMenuView({
  participantId,
  name,
  model,
  actions,
  onCompact,
  onInterrupt,
  onOpenTerminal,
  onReconnect,
  onInstallHooks,
}: AgentActionMenuViewProps): JSX.Element {
  return (
    <div
      className="agent-action-menu"
      role="menu"
      aria-label={`Actions for ${name}`}
      data-participant-id={participantId}
    >
      <div className="agent-action-menu-head">{name}</div>
      <RenameSection name={name} actions={actions} />
      <CompactSection model={model} onCompact={onCompact} />
      <SlashCommandsSection model={model} actions={actions} />
      <InterruptSection model={model} onInterrupt={onInterrupt} />
      <MessageSection model={model} actions={actions} />
      <OpenTerminalSection model={model} onOpenTerminal={onOpenTerminal} />
      <ReconnectSection model={model} onReconnect={onReconnect} />
      <InstallHooksSection model={model} onInstallHooks={onInstallHooks} />
      <GoodbyeSection name={name} model={model} actions={actions} />
    </div>
  );
}

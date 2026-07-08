import type { JSX } from "react";
import { InlineTextForm, MenuButton } from "./controls.js";
import {
  EDIT_MODES,
  SLASH_COMMANDS,
  type AgentActionMenuActions,
  type AgentActionMenuModel,
} from "./types.js";

const formButtonLabels = {
  save: "Save",
  cancel: "Cancel",
  send: "Send",
} as const;

interface SectionProps {
  model: AgentActionMenuModel;
  actions: AgentActionMenuActions;
}

interface NamedSectionProps {
  name: string;
  actions: AgentActionMenuActions;
}

export function RenameSection({ actions }: NamedSectionProps): JSX.Element {
  if (actions.mode === EDIT_MODES.rename) {
    return (
      <InlineTextForm
        className="agent-action-menu-rename"
        inputAriaLabel="New name"
        value={actions.renameValue}
        onChange={actions.setRenameValue}
        onKeyDown={actions.onRenameKey}
        onSubmit={actions.submitRename}
        onCancel={actions.cancelRename}
        submitLabel={formButtonLabels.save}
        cancelLabel={formButtonLabels.cancel}
      />
    );
  }

  return <MenuButton onClick={actions.openRename}>Rename</MenuButton>;
}

export function CompactSection({
  model,
  onCompact,
}: {
  model: AgentActionMenuModel;
  onCompact(): void;
}): JSX.Element {
  return (
    <MenuButton
      disabled={model.compactDisabled}
      title={model.compactReason}
      onClick={onCompact}
    >
      Send /compact (best effort)
    </MenuButton>
  );
}

export function SlashCommandsSection({
  model,
  actions,
}: SectionProps): JSX.Element | null {
  if (!model.showSlashCommands) return null;

  return (
    <>
      <MenuButton
        ariaExpanded={actions.mode === EDIT_MODES.slash}
        onClick={actions.toggleSlash}
      >
        Slash commands…
      </MenuButton>
      {actions.mode === EDIT_MODES.slash ? (
        <SlashSubmenu actions={actions} />
      ) : null}
    </>
  );
}

function SlashSubmenu({
  actions,
}: {
  actions: AgentActionMenuActions;
}): JSX.Element {
  return (
    <div className="agent-action-menu-sub">
      <MenuButton onClick={() => actions.runSlash(SLASH_COMMANDS.clear)}>
        /clear
      </MenuButton>
      <MenuButton onClick={() => actions.runSlash(SLASH_COMMANDS.resume)}>
        /resume
      </MenuButton>
    </div>
  );
}

export function InterruptSection({
  model,
  onInterrupt,
}: {
  model: AgentActionMenuModel;
  onInterrupt(): void;
}): JSX.Element {
  return (
    <MenuButton
      disabled={model.interruptDisabled}
      title={model.interruptReason}
      onClick={onInterrupt}
    >
      Interrupt (Ctrl-C)
    </MenuButton>
  );
}

export function MessageSection({
  model,
  actions,
}: SectionProps): JSX.Element | null {
  if (!model.showMessage) return null;

  if (actions.mode === EDIT_MODES.message) {
    return (
      <InlineTextForm
        className="agent-action-menu-msg"
        inputAriaLabel="Message text"
        value={actions.messageValue}
        onChange={actions.setMessageValue}
        onKeyDown={actions.onMessageKey}
        placeholder="Type a message…"
        onSubmit={actions.submitMessage}
        onCancel={actions.cancelMessage}
        submitLabel={formButtonLabels.send}
        cancelLabel={formButtonLabels.cancel}
      />
    );
  }

  return (
    <MenuButton onClick={actions.openMessage}>Send a message…</MenuButton>
  );
}

export function OpenTerminalSection({
  model,
  onOpenTerminal,
}: {
  model: AgentActionMenuModel;
  onOpenTerminal(): void;
}): JSX.Element | null {
  if (!model.showOpenTerminal) return null;
  return <MenuButton onClick={onOpenTerminal}>Open terminal</MenuButton>;
}

export function ReconnectSection({
  model,
  onReconnect,
}: {
  model: AgentActionMenuModel;
  onReconnect(): void;
}): JSX.Element | null {
  if (!model.showReconnect) return null;
  return <MenuButton onClick={onReconnect}>Reconnect</MenuButton>;
}

export function InstallHooksSection({
  model,
  onInstallHooks,
}: {
  model: AgentActionMenuModel;
  onInstallHooks?: () => void;
}): JSX.Element | null {
  if (!model.showInstallHooks || onInstallHooks === undefined) return null;
  return <MenuButton onClick={onInstallHooks}>Install hooks</MenuButton>;
}

export function GoodbyeSection({
  name,
  model,
  actions,
}: NamedSectionProps & {
  model: AgentActionMenuModel;
}): JSX.Element | null {
  if (!model.showGoodbye) return null;

  if (actions.mode === EDIT_MODES.confirmGoodbye) {
    return (
      <div className="agent-action-menu-confirm">
        <span>Say goodbye to {name}?</span>
        <button
          type="button"
          className="confirm-yes"
          aria-label="Confirm goodbye"
          onClick={actions.confirmGoodbye}
        >
          Yes
        </button>
        <button
          type="button"
          className="confirm-no"
          aria-label="Cancel goodbye"
          onClick={actions.cancelMode}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="agent-action-menu-sep" role="separator" />
      <MenuButton destructive onClick={actions.requestGoodbye}>
        Say goodbye
      </MenuButton>
    </>
  );
}

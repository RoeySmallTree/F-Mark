import type { KeyboardEvent } from "react";

export type EditMode = "none" | "rename" | "message" | "slash" | "confirm-goodbye";

export const EDIT_MODES = {
  none: "none",
  rename: "rename",
  message: "message",
  slash: "slash",
  confirmGoodbye: "confirm-goodbye",
} as const satisfies Record<string, EditMode>;

export type SlashCommand = "clear" | "resume";

export const SLASH_COMMANDS = {
  clear: "clear",
  resume: "resume",
} as const satisfies Record<string, SlashCommand>;

export interface AgentActionMenuModel {
  compactDisabled: boolean;
  compactReason: string | undefined;
  interruptDisabled: boolean;
  interruptReason: string | undefined;
  showSlashCommands: boolean;
  showMessage: boolean;
  showOpenTerminal: boolean;
  showReconnect: boolean;
  showInstallHooks: boolean;
  showGoodbye: boolean;
}

export interface AgentActionMenuActions {
  mode: EditMode;
  renameValue: string;
  messageValue: string;
  setRenameValue(value: string): void;
  setMessageValue(value: string): void;
  openRename(): void;
  cancelRename(): void;
  submitRename(): void;
  onRenameKey(e: KeyboardEvent<HTMLInputElement>): void;
  toggleSlash(): void;
  runSlash(command: SlashCommand): void;
  openMessage(): void;
  cancelMessage(): void;
  submitMessage(): void;
  onMessageKey(e: KeyboardEvent<HTMLInputElement>): void;
  requestGoodbye(): void;
  confirmGoodbye(): void;
  cancelMode(): void;
}

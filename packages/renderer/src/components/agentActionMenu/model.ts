import type { PresenceState } from "@f-mark/shared";
import type { AgentActionMenuModel } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  offline: "offline",
  paneDead: "pane-dead",
  hookNotInstalled: "hook-not-installed",
  online: "online",
} as const;

interface AgentActionMenuModelInput {
  state: PresenceState;
  managed: boolean;
  hasInstallHooks: boolean;
}

interface DisabledState {
  disabled: boolean;
  reason: string | undefined;
}

export function buildAgentActionMenuModel({
  state,
  managed,
  hasInstallHooks,
}: AgentActionMenuModelInput): AgentActionMenuModel {
  const compact = compactState(state, managed);
  const interrupt = interruptState(state, managed);

  return {
    compactDisabled: compact.disabled,
    compactReason: compact.reason,
    interruptDisabled: interrupt.disabled,
    interruptReason: interrupt.reason,
    showSlashCommands: managed,
    showMessage: managed,
    showOpenTerminal: managed,
    showReconnect: state === NO_LOOSE_STRING_VALUES.offline || state === NO_LOOSE_STRING_VALUES.paneDead,
    showInstallHooks: state === NO_LOOSE_STRING_VALUES.hookNotInstalled && hasInstallHooks,
    showGoodbye: managed,
  };
}

function compactState(state: PresenceState, managed: boolean): DisabledState {
  if (!managed) {
    return { disabled: true, reason: "Not a managed agent" };
  }
  if (state !== NO_LOOSE_STRING_VALUES.online) {
    return { disabled: true, reason: "Agent is not online" };
  }
  return { disabled: false, reason: undefined };
}

function interruptState(state: PresenceState, managed: boolean): DisabledState {
  if (!managed) {
    return { disabled: true, reason: "Not a managed agent" };
  }
  if (state === NO_LOOSE_STRING_VALUES.offline) {
    return { disabled: true, reason: "Agent is offline" };
  }
  if (state === NO_LOOSE_STRING_VALUES.paneDead) {
    return { disabled: true, reason: "Pane has exited" };
  }
  return { disabled: false, reason: undefined };
}

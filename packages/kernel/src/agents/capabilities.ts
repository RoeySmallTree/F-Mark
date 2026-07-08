import {
  defaultRuntimeAccessMode,
  runtimeAccessModeOptions,
  type RuntimeControlCapabilities,
} from "@f-mark/shared";

export type RuntimeControlAction = "compact" | "clear";

const DEFAULT_CAPABILITY: RuntimeControlCapabilities = {
  runtime_id: "unknown",
  compact_command: null,
  clear_command: null,
  fork: {
    native_supported: false,
    verified: false,
    command: null,
    command_accepts_name: false,
    cli_command: null,
    notes: "F-Mark-owned fork handoff only.",
  },
  subagents: {
    final_result_supported: false,
    progressive_supported: false,
    verified: false,
    sources: [],
    notes: "No sub-agent capture verified for this runtime.",
  },
  reconnect_supported: false,
  access_modes: [],
  default_access_mode: defaultRuntimeAccessMode(null),
  launch_access_modes: [],
  access_change_supported: false,
  access_change_reason: "No verified live permission control for this runtime.",
  context_source: "unsupported",
  context_reason: "No verified context usage source for this runtime.",
};

export const RUNTIME_CONTROL_CAPABILITIES: Record<string, RuntimeControlCapabilities> = {
  claude: {
    runtime_id: "claude",
    compact_command: "/compact",
    clear_command: "/clear",
    fork: {
      native_supported: true,
      verified: false,
      command: "/branch",
      command_accepts_name: true,
      cli_command: "claude --resume <source> --fork-session --name <name>",
      notes:
        "CLI exposes --fork-session; managed-pane native branch stays disabled until slash-command smoke passes.",
    },
    subagents: {
      final_result_supported: true,
      progressive_supported: false,
      verified: false,
      sources: ["Agent tool transcript", "SubagentStart/SubagentStop hook"],
      notes:
        "Final-result capture is implemented; real-runtime verification is recorded per hot report.",
    },
    reconnect_supported: true,
    access_modes: runtimeAccessModeOptions("claude").map((mode) => mode.id),
    default_access_mode: defaultRuntimeAccessMode("claude"),
    launch_access_modes: runtimeAccessModeOptions("claude"),
    access_change_supported: true,
    access_change_reason:
      "Permission mode is saved now and applied when the agent reconnects.",
    context_source: "model-catalog",
    context_reason:
      "Available context comes from the model catalog; used context requires live status telemetry.",
  },
  codex: {
    runtime_id: "codex",
    compact_command: "/compact",
    clear_command: "/clear",
    fork: {
      native_supported: true,
      verified: false,
      command: "/fork",
      command_accepts_name: false,
      cli_command: "codex fork <session_id> <prompt>",
      notes:
        "CLI exposes codex fork; managed-pane native /fork stays disabled until slash-command smoke passes.",
    },
    subagents: {
      final_result_supported: true,
      progressive_supported: false,
      verified: false,
      sources: ["multi_agent_v1 transcript", "SubagentStart/SubagentStop hook"],
      notes:
        "Codex multi_agent_v1 transcript capture is implemented; structured hook capture is also supported when surfaced by the runtime.",
    },
    reconnect_supported: true,
    access_modes: runtimeAccessModeOptions("codex").map((mode) => mode.id),
    default_access_mode: defaultRuntimeAccessMode("codex"),
    launch_access_modes: runtimeAccessModeOptions("codex"),
    access_change_supported: true,
    access_change_reason:
      "Approval policy is saved now and applied when the agent reconnects.",
    context_source: "model-catalog",
    context_reason:
      "Available context comes from the model catalog; used context requires token-usage telemetry.",
  },
  opencode: {
    runtime_id: "opencode",
    compact_command: "/compact",
    clear_command: "/clear",
    fork: {
      native_supported: true,
      verified: false,
      command: "/fork",
      command_accepts_name: false,
      cli_command: "opencode run --session <id> --fork",
      notes:
        "Opencode exposes /fork slash command and --fork on run. Slash-command behavior is pending TUI verification.",
    },
    subagents: {
      final_result_supported: false,
      progressive_supported: false,
      verified: false,
      sources: [],
      notes:
        "Opencode v1.15 has no first-class sub-agent dispatch; track via tool.execute hooks if needed.",
    },
    reconnect_supported: true,
    access_modes: runtimeAccessModeOptions("opencode").map((mode) => mode.id),
    default_access_mode: defaultRuntimeAccessMode("opencode"),
    launch_access_modes: runtimeAccessModeOptions("opencode"),
    access_change_supported: true,
    access_change_reason:
      "Permission mode is saved now and applied when the agent reconnects.",
    context_source: "model-catalog",
    context_reason:
      "Available context comes from the model catalog when the provider reports it; used context requires live telemetry.",
  },
};

export function runtimeCapabilities(
  runtimeId: string | null,
): RuntimeControlCapabilities {
  if (runtimeId === null) return DEFAULT_CAPABILITY;
  return RUNTIME_CONTROL_CAPABILITIES[runtimeId] ?? {
    ...DEFAULT_CAPABILITY,
    runtime_id: runtimeId,
  };
}

export function runtimeControlCommand(
  runtimeId: string | null,
  action: RuntimeControlAction,
): string | null {
  const caps = runtimeCapabilities(runtimeId);
  return action === "compact" ? caps.compact_command : caps.clear_command;
}

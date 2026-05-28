import type { RuntimeControlCapabilities } from "@f-mark/shared";

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
  access_modes: ["unknown"],
  access_change_supported: false,
  context_source: "unknown",
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
    access_modes: ["unknown"],
    access_change_supported: false,
    context_source: "unknown",
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
    access_modes: ["unknown"],
    access_change_supported: false,
    context_source: "unknown",
  },
  gemini: {
    runtime_id: "gemini",
    compact_command: "/compress",
    clear_command: "/clear",
    fork: {
      native_supported: false,
      verified: false,
      command: null,
      command_accepts_name: false,
      cli_command: null,
      notes:
        "No Gemini fork command verified; use F-Mark-owned fork handoff in v1.",
    },
    subagents: {
      final_result_supported: true,
      progressive_supported: false,
      verified: false,
      sources: ["invoke_agent transcript/tool record"],
      notes:
        "Final-result capture is implemented for invoke_agent-shaped records; real-runtime verification is recorded per hot report.",
    },
    reconnect_supported: true,
    access_modes: ["unknown"],
    access_change_supported: false,
    context_source: "unknown",
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
        "Opencode exposes /fork slash command and --fork on run. Slash-command behavior pending Phase 7 TUI verification.",
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
    access_modes: ["unknown"],
    access_change_supported: false,
    context_source: "unknown",
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

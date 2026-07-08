import type { EnvProbeResult, RuntimeEntry } from "@f-mark/shared";

export const BASE_RUNTIMES: Record<string, RuntimeEntry> = {
  claude: {
    displayName: "Claude Code",
    executable: "claude",
    args: [],
    icon: "claude",
    readyDelayMs: 2000,
  },
  codex: {
    displayName: "Codex",
    executable: "codex",
    args: ["--hello"],
    icon: "codex",
    readyDelayMs: 1500,
  },
  opencode: {
    displayName: "Opencode",
    executable: "opencode",
    args: [],
    icon: "opencode",
    readyDelayMs: 1500,
  },
};

export const HEALTHY_PROBE: EnvProbeResult = {
  tmux: true,
  tmuxVersion: "3.4",
  runtimes: { claude: true, codex: false, opencode: true },
  installer: "apt",
  os: "linux",
};

export function customRuntime(
  overrides: Partial<RuntimeEntry> = {},
): RuntimeEntry {
  return {
    displayName: "My Bot",
    executable: "mybot",
    args: [],
    ...overrides,
  };
}

export function runtimesWithCustom(
  entry: RuntimeEntry = customRuntime({ icon: "bot" }),
): Record<string, RuntimeEntry> {
  return {
    ...BASE_RUNTIMES,
    mybot: entry,
  };
}

export function runtimesWithRetired(): Record<string, RuntimeEntry> {
  return {
    ...BASE_RUNTIMES,
    gemini: {
      displayName: "Gemini",
      executable: "gemini",
      args: [],
    },
  };
}

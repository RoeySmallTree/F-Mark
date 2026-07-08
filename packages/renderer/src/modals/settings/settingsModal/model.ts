import {
  AtSign,
  Boxes,
  Eye,
  FileText,
  GitCompareArrows,
  Keyboard,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  isOfferableRuntimeId,
  type EnvProbeResult,
  type RuntimeEntry,
} from "@f-mark/shared";
import type { SettingsSectionKey } from "../../../state/store.js";

export interface SettingsSectionDef {
  id: SettingsSectionKey;
  label: string;
  Icon: LucideIcon;
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: "profile", label: "Profile", Icon: AtSign },
  { id: "agents", label: "Connected agents", Icon: Zap },
  { id: "runtimes", label: "Runtimes", Icon: Boxes },
  { id: "appearance", label: "Appearance", Icon: Eye },
  { id: "git-diff", label: "Git / Diff", Icon: GitCompareArrows },
  { id: "shortcuts", label: "Keyboard shortcuts", Icon: Keyboard },
  { id: "about", label: "About", Icon: FileText },
];

/* The kernel ships these runtimes as builtins (see
   packages/kernel/src/runtimes/defaults.ts). The kernel `/runtimes` routes
   persist custom entries to `.f-mark/runtimes.json`; env-probe supplies the
   current PATH availability for the same ids. */
const BUILTIN_RUNTIME_ENTRIES: Record<string, RuntimeEntry> = {
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
    args: [],
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

interface BuildSettingsRuntimesInput {
  runtimeRegistry: Record<string, RuntimeEntry> | null;
  envProbe: EnvProbeResult | null;
}

export function buildSettingsRuntimes({
  runtimeRegistry,
  envProbe,
}: BuildSettingsRuntimesInput): Record<string, RuntimeEntry> {
  const ids = new Set([
    ...Object.keys(BUILTIN_RUNTIME_ENTRIES),
    ...runtimeRegistryIds(runtimeRegistry),
    ...envProbeRuntimeIds(envProbe),
  ]);
  const out: Record<string, RuntimeEntry> = {};
  for (const id of ids) {
    out[id] =
      runtimeRegistry?.[id] ??
      BUILTIN_RUNTIME_ENTRIES[id] ??
      ({
        displayName: id,
        executable: id,
        args: [],
      } satisfies RuntimeEntry);
  }
  return out;
}

function runtimeRegistryIds(
  runtimeRegistry: Record<string, RuntimeEntry> | null,
): string[] {
  return runtimeRegistry !== null
    ? Object.keys(runtimeRegistry).filter(isOfferableRuntimeId)
    : [];
}

function envProbeRuntimeIds(envProbe: EnvProbeResult | null): string[] {
  return envProbe !== null
    ? Object.keys(envProbe.runtimes).filter(isOfferableRuntimeId)
    : [];
}

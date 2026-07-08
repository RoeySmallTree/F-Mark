import type { EnvProbeResult } from "@f-mark/shared";
import { isOfferableRuntimeId } from "@f-mark/shared";
import { KNOWN_RUNTIMES } from "../../runtimes.js";
import type { AgentSpawnRuntime } from "./types.js";

export function extractProbeRuntimes(
  envProbe: EnvProbeResult | null,
): Record<string, boolean> | null {
  if (envProbe === null) return null;
  return envProbe.runtimes ?? null;
}

export function buildAgentSpawnRuntimes(
  probeRuntimes: Record<string, boolean> | null,
): AgentSpawnRuntime[] {
  const ids = new Set([
    ...Object.keys(KNOWN_RUNTIMES),
    ...(probeRuntimes !== null
      ? Object.keys(probeRuntimes).filter(isOfferableRuntimeId)
      : []),
  ]);
  return [...ids].map((id) => ({
    id,
    displayName: KNOWN_RUNTIMES[id]?.displayName ?? id,
    available: probeRuntimes !== null ? probeRuntimes[id] !== false : true,
  }));
}

export function isTmuxMissing(envProbe: EnvProbeResult | null): boolean {
  return envProbe !== null && envProbe.tmux === false;
}

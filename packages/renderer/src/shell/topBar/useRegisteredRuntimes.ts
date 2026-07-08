import { useMemo } from "react";
import { isOfferableRuntimeId, type EnvProbeResult } from "@f-mark/shared";
import { KNOWN_RUNTIMES } from "../../runtimes.js";

type RuntimeAvailability = Record<string, boolean>;
type RegisteredRuntimes = Record<
  string,
  { displayName: string; executable: string }
>;

function runtimesFromProbe(envProbe: EnvProbeResult | null): RuntimeAvailability | null {
  if (envProbe === null) return null;
  const r = envProbe.runtimes;
  if (r === undefined || r === null) return null;
  return r;
}

function registeredRuntimesFromProbe(
  probeRuntimes: RuntimeAvailability | null,
): RegisteredRuntimes {
  const ids = new Set([
    ...Object.keys(KNOWN_RUNTIMES),
    ...(probeRuntimes !== null
      ? Object.keys(probeRuntimes).filter(isOfferableRuntimeId)
      : []),
  ]);
  const out: RegisteredRuntimes = {};
  for (const id of ids) {
    out[id] = KNOWN_RUNTIMES[id] ?? { displayName: id, executable: id };
  }
  return out;
}

export function useRegisteredRuntimes(
  envProbe: EnvProbeResult | null,
): RegisteredRuntimes {
  return useMemo(
    () => registeredRuntimesFromProbe(runtimesFromProbe(envProbe)),
    [envProbe],
  );
}

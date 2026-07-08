import type { JSX } from "react";
import type { ProviderStatus } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  ready: "ready",
} as const;

export function ProviderStatusPill({
  kind,
}: {
  kind: ProviderStatus;
}): JSX.Element {
  return (
    <span className="provider-status-pill" data-status={kind}>
      <span className="provider-status-dot" aria-hidden />
      {kind === NO_LOOSE_STRING_VALUES.ready ? NO_LOOSE_STRING_VALUES.ready : "not on PATH"}
    </span>
  );
}

import type { JSX } from "react";

const NO_LOOSE_STRING_VALUES = {
  missing: "missing",
} as const;

export function RuntimePathStatus({
  available,
  okLabel = "on PATH",
  missingLabel = NO_LOOSE_STRING_VALUES.missing,
  unknownLabel = "not probed",
}: {
  available: boolean | null;
  okLabel?: string;
  missingLabel?: string;
  unknownLabel?: string;
}): JSX.Element {
  const label =
    available === null ? unknownLabel : available ? okLabel : missingLabel;
  return (
    <span
      className={`runtime-path-pill ${available === null ? "unknown" : available ? "ok" : "missing"}`}
    >
      {label}
    </span>
  );
}

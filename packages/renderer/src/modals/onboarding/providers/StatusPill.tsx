import type { JSX } from "react";
import {
  AlertTriangle,
  Check,
  RefreshCw,
  X,
} from "lucide-react";
import {
  readyStatus,
} from "./model.js";
import type { StatusValue } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  loading: "loading",
  ready: "ready",
  stale: "stale",
  warn: "warn",
  missing: "missing",
} as const;

export function StatusPill({
  icon,
  label,
  status,
  loading,
}: {
  icon: JSX.Element;
  label: string;
  status: StatusValue;
  loading: boolean;
}): JSX.Element {
  const cls = loading
    ? NO_LOOSE_STRING_VALUES.loading
    : readyStatus(status)
      ? NO_LOOSE_STRING_VALUES.ready
      : status === NO_LOOSE_STRING_VALUES.stale
        ? NO_LOOSE_STRING_VALUES.warn
        : status === undefined
          ? NO_LOOSE_STRING_VALUES.loading
          : NO_LOOSE_STRING_VALUES.missing;
  const StateIcon = loading
    ? RefreshCw
    : readyStatus(status)
      ? Check
      : status === NO_LOOSE_STRING_VALUES.stale
        ? AlertTriangle
        : X;
  return (
    <span className={`ob-pill ${cls}`}>
      {icon}
      {label}
      <StateIcon size={11} className="ob-pill-state" />
    </span>
  );
}

import { AlertTriangle, Check, Cpu, Plug, ShieldCheck, X } from "lucide-react";
import type { IntegrationStatus } from "@f-mark/shared";
import { actionLabel, readyStatus, setupStatusClass } from "./model.js";
import type { SetupItemKind } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  runtime: "runtime",
  mcp: "mcp",
  stale: "stale",
} as const;

export interface SetupItemProps {
  kind: SetupItemKind;
  title: string;
  status: IntegrationStatus | "unknown";
  detail: string;
  version?: string;
  meta?: string;
  busy: boolean;
  onAction: (() => void) | null;
}

export function SetupItem({
  kind,
  title,
  status,
  detail,
  version,
  meta,
  busy,
  onAction,
}: SetupItemProps): JSX.Element {
  const ItemIcon =
    kind === NO_LOOSE_STRING_VALUES.runtime ? Cpu : kind === NO_LOOSE_STRING_VALUES.mcp ? Plug : ShieldCheck;
  const isReady = readyStatus(status);
  const StateIcon = isReady
    ? Check
    : status === NO_LOOSE_STRING_VALUES.stale
      ? AlertTriangle
      : X;
  const statusClass = setupStatusClass(status);
  const actionDisabled = busy || onAction === null || isReady;
  const label = actionLabel(status);
  return (
    <div className={`integration-setup-item ${statusClass}`}>
      <div className="integration-setup-item-core">
        <span className="integration-setup-kind">
          <ItemIcon size={18} strokeWidth={1.6} aria-hidden />
        </span>
        <span className="integration-setup-state" aria-hidden>
          <StateIcon size={14} strokeWidth={1.8} />
        </span>
        <span className="integration-setup-copy">
          <span className="integration-setup-title">{title}</span>
          <span className="integration-setup-detail">{detail}</span>
          {version !== undefined && isReady ? (
            <span className="integration-setup-version">v {version}</span>
          ) : null}
          {meta !== undefined ? (
            <span className="integration-setup-meta">{meta}</span>
          ) : null}
        </span>
        <button
          type="button"
          className={`integration-setup-action ${statusClass}`}
          disabled={actionDisabled}
          onClick={() => onAction?.()}
        >
          <span className="integration-setup-action-label">{label}</span>
          <span className="integration-setup-action-mark" aria-hidden>
            {isReady ? "✓" : "↗"}
          </span>
        </button>
      </div>
    </div>
  );
}

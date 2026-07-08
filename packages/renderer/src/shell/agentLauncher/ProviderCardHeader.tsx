import type { JSX } from "react";
import { ArrowRight } from "lucide-react";
import { ProviderLogo } from "./ProviderLogo.js";
import type { ProviderCardModel } from "./types.js";

const CONNECT_LABELS = {
  idle: "Connect",
  connecting: "Connecting…",
} as const;

export function ProviderCardHeader({
  model,
  disabled,
  onSpawnRuntime,
}: {
  model: ProviderCardModel;
  disabled: boolean;
  onSpawnRuntime(runtimeId: string): void;
}): JSX.Element {
  return (
    <div className="agent-launcher-card-header">
      <ProviderLogo runtime={model.runtime} />
      <div className="agent-launcher-card-info">
        <div className="agent-launcher-card-name-row">
          <span className="agent-launcher-card-name">
            {model.runtime.displayName}
          </span>
          <span className="agent-launcher-card-vendor">{model.meta.vendor}</span>
        </div>
        <div className="agent-launcher-card-desc">{model.meta.desc}</div>
      </div>
      {model.isReady ? (
        <button
          type="button"
          className="agent-launcher-connect group"
          disabled={disabled || model.connecting}
          aria-busy={model.connecting}
          onClick={() => onSpawnRuntime(model.runtime.id)}
        >
          {model.connecting ? (
            <>
              <span className="agent-launcher-connect-spinner" aria-hidden />
              <span className="agent-launcher-connect-text">{CONNECT_LABELS.connecting}</span>
            </>
          ) : (
            <>
              <span className="agent-launcher-connect-text">{CONNECT_LABELS.idle}</span>
              <span className="agent-launcher-connect-icon-wrap">
                <ArrowRight size={14} className="agent-launcher-connect-icon" />
              </span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

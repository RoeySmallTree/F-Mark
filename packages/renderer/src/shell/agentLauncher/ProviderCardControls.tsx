import type { JSX } from "react";
import { Settings2 } from "lucide-react";
import { RuntimeSelect } from "../../components/RuntimeSelect.js";
import { ProviderAccessModeSelect } from "./ProviderAccessModeSelect.js";
import { ProviderStatusPill } from "./ProviderStatusPill.js";
import type { ProviderCardModel } from "./types.js";

export function ProviderCardControls({
  model,
  disabled,
  onConfigureRuntime,
  onAccessModeChange,
  onModelChange,
  onEffortChange,
}: {
  model: ProviderCardModel;
  disabled: boolean;
  onConfigureRuntime(runtimeId: string): void;
  onAccessModeChange(runtimeId: string, mode: string): void;
  onModelChange(runtimeId: string, model: string): void;
  onEffortChange(runtimeId: string, effort: string): void;
}): JSX.Element {
  return (
    <div className="agent-launcher-card-controls">
      <button
        type="button"
        className="agent-launcher-configure group"
        data-primary={!model.isReady}
        disabled={disabled}
        onClick={() => onConfigureRuntime(model.runtime.id)}
      >
        <span className="agent-launcher-configure-icon-wrap" aria-hidden="true">
          <Settings2 size={12} className="agent-launcher-configure-icon" />
        </span>
        <span className="agent-launcher-configure-text">Configure</span>
      </button>
      <div className="agent-launcher-controls-spacer" aria-hidden="true" />
      <RuntimeSelect
        kind="model"
        label="Model"
        value={model.model}
        options={model.modelOptions}
        disabled={disabled}
        ariaLabel={`${model.runtime.displayName} model`}
        className="agent-launcher-access agent-launcher-runtime-select"
        onChange={(value) => onModelChange(model.runtime.id, value)}
      />
      <RuntimeSelect
        kind="effort"
        label="Effort"
        value={model.effort}
        options={model.effortOptions}
        disabled={disabled}
        ariaLabel={`${model.runtime.displayName} effort`}
        className="agent-launcher-access agent-launcher-runtime-select"
        onChange={(value) => onEffortChange(model.runtime.id, value)}
      />
      <ProviderAccessModeSelect
        model={model}
        disabled={disabled}
        onAccessModeChange={onAccessModeChange}
      />
      <ProviderStatusPill kind={model.status} />
    </div>
  );
}

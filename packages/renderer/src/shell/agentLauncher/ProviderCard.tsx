import type { JSX } from "react";
import { ProviderCardControls } from "./ProviderCardControls.js";
import { ProviderCardHeader } from "./ProviderCardHeader.js";
import type { ProviderCardModel } from "./types.js";

export function ProviderCard({
  model,
  disabled,
  onSpawnRuntime,
  onConfigureRuntime,
  onAccessModeChange,
  onModelChange,
  onEffortChange,
}: {
  model: ProviderCardModel;
  disabled: boolean;
  onSpawnRuntime(runtimeId: string): void;
  onConfigureRuntime(runtimeId: string): void;
  onAccessModeChange(runtimeId: string, mode: string): void;
  onModelChange(runtimeId: string, model: string): void;
  onEffortChange(runtimeId: string, effort: string): void;
}): JSX.Element {
  return (
    <div
      className="agent-launcher-card"
      data-ready={model.isReady}
      data-disabled={disabled}
    >
      <div className="agent-launcher-card-inner">
        <ProviderCardHeader
          model={model}
          disabled={disabled}
          onSpawnRuntime={onSpawnRuntime}
        />
        <ProviderCardControls
          model={model}
          disabled={disabled}
          onConfigureRuntime={onConfigureRuntime}
          onAccessModeChange={onAccessModeChange}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
        />
      </div>
    </div>
  );
}

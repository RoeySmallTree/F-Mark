import type { JSX } from "react";
import { accessModeOptionLabel } from "./model.js";
import type { ProviderCardModel } from "./types.js";

export function ProviderAccessModeSelect({
  model,
  disabled,
  onAccessModeChange,
}: {
  model: ProviderCardModel;
  disabled: boolean;
  onAccessModeChange(runtimeId: string, mode: string): void;
}): JSX.Element | null {
  if (model.accessModeOptions.length <= 1) return null;

  return (
    <label className="agent-launcher-access">
      <span>Mode</span>
      <select
        value={model.accessMode}
        disabled={disabled}
        aria-label={`${model.runtime.displayName} permission mode`}
        onChange={(event) =>
          onAccessModeChange(model.runtime.id, event.currentTarget.value)
        }
      >
        {model.accessModeOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {accessModeOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

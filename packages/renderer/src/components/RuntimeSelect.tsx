import type { JSX } from "react";
import type { EffortDescriptor, ModelDescriptor } from "@f-mark/shared";

type RuntimeSelectKind = "model" | "effort";
type RuntimeSelectOption = ModelDescriptor | EffortDescriptor;

const RUNTIME_SELECT_KINDS = {
  effort: "effort",
} as const;

interface RuntimeSelectProps {
  kind: RuntimeSelectKind;
  label: string;
  value: string;
  options: RuntimeSelectOption[];
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  selectClassName?: string;
  description?: string;
  onChange(value: string): void;
}

export function RuntimeSelect({
  kind,
  label,
  value,
  options,
  disabled = false,
  ariaLabel,
  className,
  selectClassName,
  description,
  onChange,
}: RuntimeSelectProps): JSX.Element {
  const visibleOptions = withCurrentOption(options, value);

  return (
    <label className={className}>
      <span>
        {description !== undefined ? (
          <>
            <b>{label}</b>
            <small>{description}</small>
          </>
        ) : (
          label
        )}
      </span>
      <select
        className={selectClassName}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">Provider default</option>
        {visibleOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {optionLabel(kind, option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function withCurrentOption<T extends RuntimeSelectOption>(
  options: T[],
  currentValue: string,
): RuntimeSelectOption[] {
  if (
    currentValue.length === 0 ||
    options.some((option) => option.id === currentValue)
  ) {
    return options;
  }
  return [{ id: currentValue, displayName: currentValue }, ...options];
}

function optionLabel(
  kind: RuntimeSelectKind,
  option: RuntimeSelectOption,
): string {
  if (kind === RUNTIME_SELECT_KINDS.effort) return option.displayName;
  if (option.displayName === option.id) return option.displayName;
  return `${option.displayName} (${option.id})`;
}

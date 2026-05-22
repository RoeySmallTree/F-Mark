import type { JSX } from "react";

interface ModeOption<M extends string> {
  value: M;
  label: string;
}

interface Props<M extends string> {
  options: ModeOption<M>[];
  value: M;
  onChange(next: M): void;
  className?: string;
}

/**
 * Small segmented control matching `design.html`'s `.seg-control` pattern but
 * keyed to our CSS variables so it themes correctly. Generic over the value
 * type, so it works for both markdown modes and JSON modes (and anything
 * else with a fixed set of string-valued options).
 */
export function ModeToggle<M extends string>({
  options,
  value,
  onChange,
  className,
}: Props<M>): JSX.Element {
  const cls = "fm-mode-toggle" + (className ? " " + className : "");
  return (
    <div className={cls} role="group">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={"fm-mode-toggle-btn" + (active ? " on" : "")}
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(opt.value);
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

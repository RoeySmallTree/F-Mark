import type { JSX, KeyboardEvent } from "react";

const NO_LOOSE_STRING_VALUES = {
  agentActionMenuItem: "agent-action-menu-item",
} as const;

interface MenuButtonProps {
  children: string;
  onClick(): void;
  disabled?: boolean;
  title?: string;
  destructive?: boolean;
  ariaExpanded?: boolean;
}

export function MenuButton({
  children,
  onClick,
  disabled,
  title,
  destructive,
  ariaExpanded,
}: MenuButtonProps): JSX.Element {
  const className = destructive
    ? "agent-action-menu-item destructive"
    : NO_LOOSE_STRING_VALUES.agentActionMenuItem;

  return (
    <button
      type="button"
      role="menuitem"
      className={className}
      disabled={disabled}
      title={title}
      aria-expanded={ariaExpanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface InlineTextFormProps {
  className: string;
  inputAriaLabel: string;
  value: string;
  onChange(value: string): void;
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): void;
  onSubmit(): void;
  onCancel(): void;
  submitLabel: string;
  cancelLabel: string;
  placeholder?: string;
}

export function InlineTextForm({
  className,
  inputAriaLabel,
  value,
  onChange,
  onKeyDown,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel,
  placeholder,
}: InlineTextFormProps): JSX.Element {
  return (
    <div className={className}>
      <input
        type="text"
        aria-label={inputAriaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus
      />
      <button type="button" onClick={onSubmit}>
        {submitLabel}
      </button>
      <button type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
    </div>
  );
}

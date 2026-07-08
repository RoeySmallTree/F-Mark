import type { JSX, MouseEventHandler, MutableRefObject, ReactNode } from "react";

interface ToolbarIconButtonProps {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  label?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  refObject?: MutableRefObject<HTMLButtonElement | null>;
  title: string;
}

export function ToolbarIconButton({
  ariaLabel,
  children,
  disabled = false,
  label,
  onClick,
  refObject,
  title,
}: ToolbarIconButtonProps): JSX.Element {
  return (
    <button
      ref={refObject}
      type="button"
      className="mode-btn"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
    >
      {children}
      {label !== undefined && <span className="dock-label">{label}</span>}
    </button>
  );
}


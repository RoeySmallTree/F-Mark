import type { JSX, ReactNode } from "react";

export function ActionLabel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={`primary-action__label${active ? " is-active" : ""}`}
      aria-hidden={!active}
    >
      {children}
    </span>
  );
}


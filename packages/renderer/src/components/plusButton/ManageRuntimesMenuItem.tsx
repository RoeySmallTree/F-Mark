import type { JSX } from "react";

interface ManageRuntimesMenuItemProps {
  onClick(): void;
}

export function ManageRuntimesMenuItem({
  onClick,
}: ManageRuntimesMenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className="plus-menu-item plus-menu-utility-item"
      onClick={onClick}
    >
      <span className="plus-menu-icon" aria-hidden>
        {"⚙"}
      </span>
      <span className="plus-menu-label-wrap">
        <span className="plus-menu-label">Manage runtimes…</span>
        <span className="plus-menu-sub">Configure providers</span>
      </span>
      <span className="plus-menu-launch-mark" aria-hidden>
        ↗
      </span>
    </button>
  );
}

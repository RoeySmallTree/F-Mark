import type { JSX } from "react";
import { AgentKindArt } from "../ParticipantAvatar.js";
import type { TerminalMenuItemModel } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  terminal: "terminal",
} as const;

interface TerminalMenuItemProps {
  item: TerminalMenuItemModel;
  onClick(): void;
}

export function TerminalMenuItem({
  item,
  onClick,
}: TerminalMenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className="plus-menu-item plus-menu-utility-item"
      disabled={item.disabled}
      title={item.title}
      onClick={onClick}
    >
      <span className="plus-menu-icon" aria-hidden>
        <AgentKindArt
          kind={NO_LOOSE_STRING_VALUES.terminal}
          className="plus-menu-icon-art"
        />
      </span>
      <span className="plus-menu-label-wrap">
        <span className="plus-menu-label">Terminal</span>
        <span className="plus-menu-sub">Open a managed shell</span>
      </span>
      {item.hint !== null ? (
        <span className="plus-menu-hint">{item.hint}</span>
      ) : null}
      <span className="plus-menu-launch-mark" aria-hidden>
        ↗
      </span>
    </button>
  );
}

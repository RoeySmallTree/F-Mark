import type { JSX, MouseEvent } from "react";
import {
  GitFork,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import type { SessionMeta } from "../../api/client.js";
import type { SessionContextMenuState } from "./useSessionPanelUiState.js";

interface SessionContextMenuProps {
  contextMenu: SessionContextMenuState;
  onBeginRename: (session: SessionMeta) => void;
  onClose: () => void;
  onDelete: (session: SessionMeta) => void | Promise<void>;
  onFocus: (session: SessionMeta) => void | Promise<void>;
  onOpenFork: (
    event: MouseEvent<HTMLButtonElement>,
    session: SessionMeta,
  ) => void;
}

export function SessionContextMenu(
  props: SessionContextMenuProps,
): JSX.Element {
  const {
    contextMenu,
    onBeginRename,
    onClose,
    onDelete,
    onFocus,
    onOpenFork,
  } = props;

  return (
    <div
      className="session-context-menu"
      role="menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onMouseLeave={onClose}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => void onFocus(contextMenu.session)}
      >
        <Search size={13} aria-hidden />
        Focus
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onBeginRename(contextMenu.session)}
      >
        <Pencil size={13} aria-hidden />
        Rename
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={(e) => onOpenFork(e, contextMenu.session)}
      >
        <GitFork size={13} aria-hidden />
        Fork
      </button>
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={() => void onDelete(contextMenu.session)}
      >
        <Trash2 size={13} aria-hidden />
        Delete
      </button>
    </div>
  );
}

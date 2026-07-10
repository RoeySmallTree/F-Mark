import { useEffect, useRef, type JSX, type MouseEvent } from "react";
import {
  GitFork,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import type { SessionMeta } from "../../api/client.js";
import type { SessionContextMenuState } from "./useSessionPanelUiState.js";

const MENU_WIDTH = 216;
const MENU_HEIGHT = 206;
const VIEWPORT_GUTTER = 8;

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

function clampToViewport(value: number, viewport: number, size: number): number {
  return Math.max(
    VIEWPORT_GUTTER,
    Math.min(value, viewport - size - VIEWPORT_GUTTER),
  );
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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const left = clampToViewport(contextMenu.x, window.innerWidth, MENU_WIDTH);
  const top = clampToViewport(contextMenu.y, window.innerHeight, MENU_HEIGHT);

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target)) onClose();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="session-context-menu"
      role="menu"
      aria-label={`Actions for ${contextMenu.session.slug}`}
      style={{ left, top }}
    >
      <div className="session-context-head">
        <span>Session</span>
        <strong title={contextMenu.session.slug}>{contextMenu.session.slug}</strong>
      </div>
      <div className="session-context-actions">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            void onFocus(contextMenu.session);
          }}
        >
          <span className="session-context-icon" aria-hidden>
            <Search size={14} strokeWidth={1.5} />
          </span>
          <span>Focus session</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onBeginRename(contextMenu.session);
          }}
        >
          <span className="session-context-icon" aria-hidden>
            <Pencil size={14} strokeWidth={1.5} />
          </span>
          <span>Rename</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={(event) => onOpenFork(event, contextMenu.session)}
        >
          <span className="session-context-icon" aria-hidden>
            <GitFork size={14} strokeWidth={1.5} />
          </span>
          <span>Fork session</span>
        </button>
      </div>
      <div className="session-context-danger">
        <button
          type="button"
          role="menuitem"
          className="danger"
          onClick={() => {
            onClose();
            void onDelete(contextMenu.session);
          }}
        >
          <span className="session-context-icon" aria-hidden>
            <Trash2 size={14} strokeWidth={1.5} />
          </span>
          <span>Delete session</span>
        </button>
      </div>
    </div>
  );
}

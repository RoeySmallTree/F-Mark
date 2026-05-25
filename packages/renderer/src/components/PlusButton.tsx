/* PlusButton — a small "+" affordance in the top bar that opens a dropdown
   with three sections:

     1. One row per registered runtime (id + displayName). Rows whose
        runtime is not on PATH are disabled with a "Not on PATH" tooltip.
     2. A Terminal row (spawn a managed terminal pane). Disabled when the
        env probe reports that tmux is missing.
     3. A "Manage runtimes…" entry that opens the runtime registry panel.

   The dropdown is rendered inline with fixed viewport positioning so it is
   not clipped by the scrollable chip strip. Escape and outside-click close it. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from "react";
import { avatarIconSrc, avatarKind } from "./ParticipantAvatar.js";
import "./chips.css";

export interface PlusButtonRuntime {
  id: string;
  displayName: string;
  available: boolean;
}

export interface PlusButtonProps {
  runtimes: PlusButtonRuntime[];
  onSpawnRuntime(id: string): void;
  onSpawnTerminal(): void;
  onManageRuntimes(): void;
  /* When env-probe reports tmux is missing the terminal entry becomes
     non-actionable. This is optional so the renderer doesn't need to
     thread the env probe through if it's known good. */
  tmuxMissing?: boolean;
  /* When the kernel process-spawning API is disabled, runtime/terminal rows
     stay visible but become non-actionable with a precise tooltip. */
  spawnDisabledReason?: string | null;
}

export function PlusButton({
  runtimes,
  onSpawnRuntime,
  onSpawnTerminal,
  onManageRuntimes,
  tmuxMissing,
  spawnDisabledReason = null,
}: PlusButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const positionMenu = useCallback(() => {
    const wrap = wrapRef.current;
    if (wrap === null) return;
    const rect = wrap.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const margin = 8;
    const estimatedMenuWidth = 220;
    const maxRight = Math.max(margin, viewportWidth - estimatedMenuWidth - margin);
    const right = Math.min(
      Math.max(margin, viewportWidth - rect.right),
      maxRight,
    );
    setMenuPosition({
      top: rect.bottom + 4,
      right,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    positionMenu();
  }, [open, positionMenu]);

  /* Outside-click and Escape close. Mounted only while the menu is open
     so the listeners do not run when idle. */
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (wrapRef.current === null) return;
      if (!(e.target instanceof Node)) return;
      if (wrapRef.current.contains(e.target)) return;
      close();
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    function onReposition(): void {
      positionMenu();
    }
    /* Use a microtask delay so the same click that opens the menu does
       not also immediately close it via the outside-click listener. */
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocMouseDown);
    }, 0);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, close, positionMenu]);

  function handleSpawnRuntime(id: string, available: boolean): void {
    if (spawnDisabledReason !== null) return;
    if (!available) return;
    onSpawnRuntime(id);
    close();
  }

  function handleSpawnTerminal(): void {
    if (spawnDisabledReason !== null) return;
    if (tmuxMissing === true) return;
    onSpawnTerminal();
    close();
  }

  function handleManage(): void {
    onManageRuntimes();
    close();
  }

  const menuStyle: CSSProperties =
    menuPosition === null
      ? { position: "fixed", visibility: "hidden" }
      : {
          position: "fixed",
          top: menuPosition.top,
          right: menuPosition.right,
          marginTop: 0,
        };

  return (
    <div className="plus-btn-wrap" ref={wrapRef}>
      <button
        type="button"
        className="plus-btn"
        aria-label="Add agent or terminal"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      {open ? (
        <div
          className="plus-menu"
          role="menu"
          aria-label="Spawn options"
          style={menuStyle}
        >
          {runtimes.map((rt) => (
            <button
              key={rt.id}
              type="button"
              role="menuitem"
              className="plus-menu-item"
              disabled={spawnDisabledReason !== null || !rt.available}
              title={
                spawnDisabledReason ??
                (!rt.available ? "Not on PATH" : undefined)
              }
              onClick={() => handleSpawnRuntime(rt.id, rt.available)}
            >
              <span className="plus-menu-icon" aria-hidden>
                <img
                  src={avatarIconSrc(
                    avatarKind({ kind: "agent", runtimeId: rt.id, name: rt.displayName }),
                  )}
                  alt=""
                  draggable={false}
                />
              </span>
              <span className="plus-menu-label">{rt.displayName}</span>
              {spawnDisabledReason !== null ? (
                <span className="plus-menu-hint">disabled</span>
              ) : !rt.available ? (
                <span className="plus-menu-hint">Not on PATH</span>
              ) : null}
            </button>
          ))}

          <div className="plus-menu-sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="plus-menu-item"
            disabled={spawnDisabledReason !== null || tmuxMissing === true}
            title={
              spawnDisabledReason ??
              (tmuxMissing === true ? "tmux is not installed" : undefined)
            }
            onClick={handleSpawnTerminal}
          >
            <span className="plus-menu-icon" aria-hidden>
              <img src={avatarIconSrc("terminal")} alt="" draggable={false} />
            </span>
            <span className="plus-menu-label">Terminal</span>
            {spawnDisabledReason !== null ? (
              <span className="plus-menu-hint">disabled</span>
            ) : tmuxMissing === true ? (
              <span className="plus-menu-hint">tmux missing</span>
            ) : null}
          </button>

          <div className="plus-menu-sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="plus-menu-item"
            onClick={handleManage}
          >
            <span className="plus-menu-icon" aria-hidden>
              {"⚙"}
            </span>
            <span className="plus-menu-label">Manage runtimes…</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

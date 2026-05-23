/* PlusButton — a small "+" affordance in the top bar that opens a dropdown
   with three sections:

     1. One row per registered runtime (id + displayName). Rows whose
        runtime is not on PATH are disabled with a "Not on PATH" tooltip.
     2. A Terminal row (spawn a managed terminal pane). Disabled when the
        env probe reports that tmux is missing.
     3. A "Manage runtimes…" entry that opens the runtime registry panel.

   The dropdown is rendered inline (absolutely positioned next to the
   button). Escape and outside-click close it. */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
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
}

function runtimeInitial(id: string): string {
  if (id === "gemini") return "G";
  return "C";
}

export function PlusButton({
  runtimes,
  onSpawnRuntime,
  onSpawnTerminal,
  onManageRuntimes,
  tmuxMissing,
}: PlusButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

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
    /* Use a microtask delay so the same click that opens the menu does
       not also immediately close it via the outside-click listener. */
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocMouseDown);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  function handleSpawnRuntime(id: string, available: boolean): void {
    if (!available) return;
    onSpawnRuntime(id);
    close();
  }

  function handleSpawnTerminal(): void {
    if (tmuxMissing === true) return;
    onSpawnTerminal();
    close();
  }

  function handleManage(): void {
    onManageRuntimes();
    close();
  }

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
        >
          {runtimes.map((rt) => (
            <button
              key={rt.id}
              type="button"
              role="menuitem"
              className="plus-menu-item"
              disabled={!rt.available}
              title={!rt.available ? "Not on PATH" : undefined}
              onClick={() => handleSpawnRuntime(rt.id, rt.available)}
            >
              <span className="plus-menu-icon" aria-hidden>
                {runtimeInitial(rt.id)}
              </span>
              <span className="plus-menu-label">{rt.displayName}</span>
              {!rt.available ? (
                <span className="plus-menu-hint">Not on PATH</span>
              ) : null}
            </button>
          ))}

          <div className="plus-menu-sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="plus-menu-item"
            disabled={tmuxMissing === true}
            title={tmuxMissing === true ? "tmux is not installed" : undefined}
            onClick={handleSpawnTerminal}
          >
            <span className="plus-menu-icon" aria-hidden>
              {">_"}
            </span>
            <span className="plus-menu-label">Terminal</span>
            {tmuxMissing === true ? (
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

import { useCallback, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import {
  isOnlyEnabledRightTab,
  reorderRightTabsConfig,
  resolveRightTabsConfig,
  toggleRightTabsConfig,
  useStore,
  type RightTabConfig,
  type RightTabKey,
} from "../../state/store.js";
import { useFlipReorder } from "../../hooks/useFlipReorder.js";
import { RIGHT_TAB_META } from "./tabMeta.js";

type Mode = "global" | "session";

export function RightLayout(): JSX.Element {
  const global = useStore((s) => s.rightTabsConfig);
  const bySession = useStore((s) => s.rightTabsConfigBySession);
  const sid = useStore((s) => s.currentSessionId);
  const setGlobal = useStore((s) => s.setRightTabsConfig);
  const setSession = useStore((s) => s.setRightTabsConfigForSession);
  const clearOverride = useStore(
    (s) => s.clearRightTabsConfigForSessionOverride,
  );

  const hasOverride = sid !== null && bySession[sid] !== undefined;
  const sessionDisabled = sid === null;

  const [mode, setMode] = useState<Mode>("global");

  /* The config the user is currently editing. In session mode without an
     override we display global (and writes flip it into a session override
     on first edit). */
  const editingCfg: RightTabConfig =
    mode === "session" ? resolveRightTabsConfig(global, bySession, sid) : global;

  const commit = useCallback(
    (next: RightTabConfig): void => {
      if (mode === "session" && sid !== null) {
        setSession(next);
      } else {
        setGlobal(next);
      }
    },
    [mode, sid, setGlobal, setSession],
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  useFlipReorder(listRef, [
    editingCfg.map((t) => `${t.key}:${t.enabled ? 1 : 0}`).join("|"),
  ]);

  /* HTML5 DnD: stash the dragged key in a ref. dataTransfer.getData is
     restricted to drop in most browsers, so reading it during dragover
     to compute drop targets is unreliable. */
  const draggedKey = useRef<RightTabKey | null>(null);
  const [dropTarget, setDropTarget] = useState<RightTabKey | null>(null);

  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, key: RightTabKey): void => {
      draggedKey.current = key;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-fmark-right-tab", key);
    },
    [],
  );
  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, key: RightTabKey): void => {
      if (draggedKey.current === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== key) setDropTarget(key);
    },
    [dropTarget],
  );
  const onDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>, key: RightTabKey): void => {
      /* Only clear when leaving the row itself, not when bubbling out of a
         child. relatedTarget is null when leaving the window. */
      if (dropTarget === key) {
        const related = e.relatedTarget as Node | null;
        if (
          related === null ||
          !(e.currentTarget as Node).contains(related)
        ) {
          setDropTarget(null);
        }
      }
    },
    [dropTarget],
  );
  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, key: RightTabKey): void => {
      e.preventDefault();
      const from = draggedKey.current;
      draggedKey.current = null;
      setDropTarget(null);
      if (from === null || from === key) return;
      commit(reorderRightTabsConfig(editingCfg, from, key));
    },
    [commit, editingCfg],
  );
  const onDragEnd = useCallback((): void => {
    draggedKey.current = null;
    setDropTarget(null);
  }, []);

  /* Keyboard reorder for a11y — the row's grip handle is focusable and
     ArrowUp/ArrowDown swap with the neighbor. */
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>, key: RightTabKey): void => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const idx = editingCfg.findIndex((t) => t.key === key);
      if (idx < 0) return;
      const neighborIdx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= editingCfg.length) return;
      e.preventDefault();
      const neighbor = editingCfg[neighborIdx]!;
      commit(reorderRightTabsConfig(editingCfg, key, neighbor.key));
    },
    [commit, editingCfg],
  );

  const onToggle = useCallback(
    (key: RightTabKey): void => {
      commit(toggleRightTabsConfig(editingCfg, key));
    },
    [commit, editingCfg],
  );

  return (
    <div className="right-layout">
      <div
        className="view-toggle right-layout-mode"
        role="tablist"
        aria-label="Layout scope"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "global"}
          className={mode === "global" ? "active" : ""}
          onClick={() => setMode("global")}
        >
          Global
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "session"}
          className={mode === "session" ? "active" : ""}
          disabled={sessionDisabled}
          title={sessionDisabled ? "No active session" : undefined}
          onClick={() => setMode("session")}
        >
          This session
        </button>
      </div>

      <div
        ref={listRef}
        className="right-layout-list"
        role="list"
        aria-label="Right pane tabs"
      >
        {editingCfg.map((entry) => {
          const meta = RIGHT_TAB_META[entry.key];
          const lastEnabled = isOnlyEnabledRightTab(editingCfg, entry.key);
          return (
            <div
              key={entry.key}
              data-flip-id={entry.key}
              data-tab-key={entry.key}
              data-drop-over={dropTarget === entry.key ? "true" : undefined}
              className="right-layout-row"
              role="listitem"
              draggable
              onDragStart={(e) => onDragStart(e, entry.key)}
              onDragOver={(e) => onDragOver(e, entry.key)}
              onDragLeave={(e) => onDragLeave(e, entry.key)}
              onDrop={(e) => onDrop(e, entry.key)}
              onDragEnd={onDragEnd}
            >
              <span
                className="right-layout-handle"
                role="button"
                tabIndex={0}
                aria-label={`Reorder ${meta.label}`}
                onKeyDown={(e) => onHandleKeyDown(e, entry.key)}
              >
                <GripVertical size={14} aria-hidden="true" />
              </span>
              {meta.icon !== null ? (
                <span className="right-layout-icon">{meta.icon}</span>
              ) : null}
              <span className="right-layout-label">{meta.label}</span>
              <input
                type="checkbox"
                role="switch"
                className="right-layout-toggle"
                checked={entry.enabled}
                disabled={lastEnabled}
                aria-label={`Show ${meta.label} tab`}
                title={
                  lastEnabled
                    ? "At least one tab must stay visible"
                    : undefined
                }
                onChange={() => onToggle(entry.key)}
              />
            </div>
          );
        })}
      </div>

      {mode === "session" && hasOverride ? (
        <button
          type="button"
          className="right-layout-reset"
          onClick={clearOverride}
        >
          Reset to global
        </button>
      ) : null}
    </div>
  );
}

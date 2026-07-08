import { useEffect, useRef, useState } from "react";
import { useStore, type OpenFileTab } from "../../state/store.js";
import { useFlipReorder } from "../../hooks/useFlipReorder.js";
import { TabItem } from "./TabItem.js";
import {
  clearDragSource,
  setCircularDragImage,
} from "../../drag/dragPreview.js";

const NO_LOOSE_STRING_VALUES = {
  move: "move",
  nearest: "nearest",
} as const;

/* Stable empty-array sentinel — see comment in FileViewer.tsx. */
const EMPTY_TABS: OpenFileTab[] = [];

export function TabsRow(): JSX.Element | null {
  const sid = useStore((s) => s.currentSessionId);
  const tabs = useStore((s) =>
    sid !== null
      ? (s.fileViewerTabsBySession[sid] ?? EMPTY_TABS)
      : EMPTY_TABS,
  );
  const active = useStore((s) =>
    sid !== null ? (s.fileViewerActiveBySession[sid] ?? null) : null,
  );
  const setActive = useStore((s) => s.setFileViewerActive);
  const closeTab = useStore((s) => s.closeFileTab);
  const togglePin = useStore((s) => s.togglePinFileTab);
  const reorder = useStore((s) => s.reorderFileTabs);

  const rowRef = useRef<HTMLDivElement | null>(null);
  const draggedPathRef = useRef<string | null>(null);
  const pinScrollPathRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /* FLIP animates the move when pinned status flips or a drag reorders. */
  useFlipReorder(rowRef, [
    tabs.map((t) => `${t.path}:${t.pinned ? 1 : 0}`).join("|"),
  ]);

  /* Keep the active tab on screen — when activating a tab off the right
     edge, scroll the row so it becomes visible. */
  useEffect(() => {
    if (active === null) return;
    scrollTabIntoView(rowRef.current, active);
  }, [active]);

  useEffect(() => {
    const path = pinScrollPathRef.current;
    if (path === null) return;
    pinScrollPathRef.current = null;
    scrollTabIntoView(rowRef.current, path);
  }, [tabs]);

  if (tabs.length === 0) return null;

  const pinned = tabs.filter((t) => t.pinned);
  const unpinned = tabs.filter((t) => !t.pinned);
  const ordered: OpenFileTab[] = [...pinned, ...unpinned];

  const onDragStart = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    draggedPathRef.current = path;
    e.dataTransfer.setData("application/x-fmark-tab", path);
    e.dataTransfer.effectAllowed = NO_LOOSE_STRING_VALUES.move;
    setCircularDragImage(e.dataTransfer, e.currentTarget, {
      label: path,
      iconSelector: ".fv-tab-icon",
      fallbackText: "F",
    });
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    if (!e.dataTransfer.types.includes("application/x-fmark-tab")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = NO_LOOSE_STRING_VALUES.move;
    if (dropTarget !== path) setDropTarget(path);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    const related = e.relatedTarget as Node | null;
    if (
      dropTarget === path &&
      (related === null || !e.currentTarget.contains(related))
    ) {
      setDropTarget(null);
    }
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    const from = e.dataTransfer.getData("application/x-fmark-tab");
    if (from.length === 0) return;
    e.preventDefault();
    draggedPathRef.current = null;
    setDropTarget(null);
    clearDragSource();
    reorder(from, path);
  };
  const onDragEnd = () => {
    draggedPathRef.current = null;
    setDropTarget(null);
    clearDragSource();
  };
  const onTogglePin = (path: string): void => {
    pinScrollPathRef.current = path;
    togglePin(path);
  };

  return (
    <div className="fv-tabs" role="tablist" ref={rowRef}>
      {ordered.map((t) => (
        <TabItem
          key={t.path}
          path={t.path}
          pinned={t.pinned}
          active={t.path === active}
          onActivate={setActive}
          onClose={closeTab}
          onTogglePin={onTogglePin}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          dropBefore={
            dropTarget === t.path && draggedPathRef.current !== t.path
          }
        />
      ))}
    </div>
  );
}

/* Tab paths can contain characters CSS selectors don't like. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/[^\w-]/g, (c) => `\\${c}`);
}

function scrollTabIntoView(root: HTMLElement | null, path: string): void {
  const el = root?.querySelector<HTMLElement>(
    `[data-flip-id="${cssEscape(path)}"]`,
  );
  if (el) el.scrollIntoView({ inline: NO_LOOSE_STRING_VALUES.nearest, block: "nearest" });
}

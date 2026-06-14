import { useEffect, useRef } from "react";
import { useStore, type OpenFileTab } from "../../state/store.js";
import { useFlipReorder } from "../../hooks/useFlipReorder.js";
import { TabItem } from "./TabItem.js";

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
  /* FLIP animates the move when pinned status flips or a drag reorders. */
  useFlipReorder(rowRef, [
    tabs.map((t) => `${t.path}:${t.pinned ? 1 : 0}`).join("|"),
  ]);

  /* Keep the active tab on screen — when activating a tab off the right
     edge, scroll the row so it becomes visible. */
  useEffect(() => {
    if (active === null) return;
    const el = rowRef.current?.querySelector<HTMLElement>(
      `[data-flip-id="${cssEscape(active)}"]`,
    );
    if (el) el.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);

  if (tabs.length === 0) return null;

  const pinned = tabs.filter((t) => t.pinned);
  const unpinned = tabs.filter((t) => !t.pinned);
  const ordered: OpenFileTab[] = [...pinned, ...unpinned];

  const onDragStart = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    e.dataTransfer.setData("application/x-fmark-tab", path);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>, _path: string) => {
    if (!e.dataTransfer.types.includes("application/x-fmark-tab")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    const from = e.dataTransfer.getData("application/x-fmark-tab");
    if (from.length === 0) return;
    e.preventDefault();
    reorder(from, path);
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
          onTogglePin={togglePin}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
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

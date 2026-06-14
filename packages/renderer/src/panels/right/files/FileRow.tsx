import { type CSSProperties, useCallback, useRef } from "react";
import { Link2, Star } from "lucide-react";
import { iconForExtension } from "./iconForExtension.js";
import type { FavoriteScope, VisibleRow } from "./buildTreeView.js";
import { useStore } from "../../../state/store.js";

export interface FileRowProps {
  row: VisibleRow;
  onCycleFav: (absPath: string, current: FavoriteScope) => void;
}

const FMARK_DRAG_TYPE = "application/x-fmark-file-path";

function favTooltip(current: FavoriteScope): string {
  switch (current) {
    case null:
      return "Click to favorite (1★ this session, click again for 2★ entire project)";
    case "session":
      return "Favorited in this session. Click for 2★ entire project, click again to unstar.";
    case "project":
      return "Favorited for the entire project (all sessions). Click to unstar.";
  }
}

export function FileRow({ row, onCycleFav }: FileRowProps): JSX.Element {
  const { entry, fav } = row;
  const { Icon, colorClass } = iconForExtension(entry.ext, entry.isDir, false);
  const openFile = useStore((s) => s.openFile);

  /* Single-click opens the file; a drag past 5px starts the standard
     drag flow instead. Tracking via mousedown/mouseup refs (not onClick)
     because some browsers fire onClick after a canceled drag, which
     would open a file the user was just trying to drop somewhere. */
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return; /* left button only */
      downRef.current = { x: e.clientX, y: e.clientY };
      draggedRef.current = false;
    },
    [],
  );

  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      draggedRef.current = true;
      e.dataTransfer.setData(FMARK_DRAG_TYPE, entry.absPath);
      e.dataTransfer.setData("text/plain", entry.absPath);
      e.dataTransfer.effectAllowed = "copy";
    },
    [entry.absPath],
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return;
      const start = downRef.current;
      downRef.current = null;
      if (draggedRef.current) return;
      if (start === null) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx >= 5 || dy >= 5) return;
      /* Star button has its own onClick with stopPropagation, so we
         don't reach here when the user clicks the star. */
      openFile(entry.absPath);
    },
    [entry.absPath, openFile],
  );

  const onStarClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onCycleFav(entry.absPath, fav);
    },
    [entry.absPath, fav, onCycleFav],
  );

  const className = [
    "file-row",
    entry.ignored ? "is-ignored" : null,
    fav === "session" ? "is-fav-session" : null,
    fav === "project" ? "is-fav-project" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{ "--depth": entry.depth } as CSSProperties}
      draggable
      onDragStart={onDragStart}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      title={entry.absPath}
    >
      <Icon
        size={13}
        aria-hidden
        className={`file-row-icon ${colorClass}`.trim()}
      />
      <span className="file-row-name">{entry.name}</span>
      {entry.isSymlink ? (
        <Link2 size={10} aria-hidden className="file-row-symlink" />
      ) : null}
      <button
        type="button"
        className="file-row-star"
        data-fav={fav ?? "none"}
        onClick={onStarClick}
        title={favTooltip(fav)}
        aria-label={favTooltip(fav)}
      >
        <Star size={12} aria-hidden />
        {fav === "project" ? (
          <Star size={12} aria-hidden className="file-row-star-second" />
        ) : null}
      </button>
    </div>
  );
}

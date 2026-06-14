import { type CSSProperties, useCallback } from "react";
import { ChevronDown, ChevronRight, Link2, Star } from "lucide-react";
import { iconForExtension } from "./iconForExtension.js";
import type { FavoriteScope, VisibleRow } from "./buildTreeView.js";

export interface FolderNodeProps {
  row: VisibleRow;
  onToggle: (relPath: string) => void;
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

export function FolderNode({
  row,
  onToggle,
  onCycleFav,
}: FolderNodeProps): JSX.Element {
  const { entry, isOpen, hasChildren, fav } = row;
  const { Icon } = iconForExtension(entry.ext, true, isOpen);
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  const onClick = useCallback((): void => {
    onToggle(entry.relPath);
  }, [entry.relPath, onToggle]);

  const onStarClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onCycleFav(entry.absPath, fav);
    },
    [entry.absPath, fav, onCycleFav],
  );

  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.dataTransfer.setData(FMARK_DRAG_TYPE, entry.absPath);
      e.dataTransfer.setData("text/plain", entry.absPath);
      e.dataTransfer.effectAllowed = "copy";
    },
    [entry.absPath],
  );

  const className = [
    "file-folder-row",
    entry.ignored ? "is-ignored" : null,
    fav === "session" ? "is-fav-session" : null,
    fav === "project" ? "is-fav-project" : null,
    isOpen ? "is-open" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{ "--depth": entry.depth } as CSSProperties}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      title={entry.absPath}
      role="button"
      aria-expanded={isOpen}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(entry.relPath);
        }
      }}
    >
      <Chevron
        size={11}
        aria-hidden
        className={hasChildren ? "file-folder-chevron" : "file-folder-chevron is-empty"}
      />
      <Icon size={13} aria-hidden className="file-row-icon" />
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

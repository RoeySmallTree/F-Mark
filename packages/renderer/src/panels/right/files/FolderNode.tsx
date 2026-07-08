import { type CSSProperties, useCallback } from "react";
import { ChevronDown, ChevronRight, Link2, Star } from "lucide-react";
import { iconForExtension } from "./iconForExtension.js";
import type { FavoriteScope, VisibleRow } from "./buildTreeView.js";
import {
  clearDragSource,
  setCircularDragImage,
} from "../../../drag/dragPreview.js";

export interface FolderNodeProps {
  row: VisibleRow;
  onToggle: (relPath: string) => void;
  onCycleFav: (absPath: string, current: FavoriteScope) => void;
}

const FMARK_DRAG_TYPE = "application/x-fmark-file-path";

const folderDragValues = {
  textPlain: "text/plain",
  copy: "copy",
  iconSelector: ".file-row-icon",
  fallbackText: "D",
} as const;

const folderClassNames = {
  row: "file-folder-row",
  ignored: "is-ignored",
  favoriteSession: "is-fav-session",
  favoriteProject: "is-fav-project",
  open: "is-open",
  chevron: "file-folder-chevron",
  emptyChevron: "file-folder-chevron is-empty",
  joiner: " ",
} as const;

const favoriteScopes = {
  session: "session",
  project: "project",
  none: "none",
} as const;

const folderKeyboardKeys = {
  enter: "Enter",
} as const;

function favTooltip(current: FavoriteScope): string {
  switch (current) {
    case null:
      return "Click to favorite (1★ this session, click again for 2★ entire project)";
    case favoriteScopes.session:
      return "Favorited in this session. Click for 2★ entire project, click again to unstar.";
    case favoriteScopes.project:
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
      e.dataTransfer.setData(folderDragValues.textPlain, entry.absPath);
      e.dataTransfer.effectAllowed = folderDragValues.copy;
      setCircularDragImage(e.dataTransfer, e.currentTarget, {
        label: entry.name,
        iconSelector: folderDragValues.iconSelector,
        fallbackText: folderDragValues.fallbackText,
        tone: folderDragValues.copy,
      });
    },
    [entry.absPath, entry.name],
  );

  const className = [
    folderClassNames.row,
    entry.ignored ? folderClassNames.ignored : null,
    fav === favoriteScopes.session ? folderClassNames.favoriteSession : null,
    fav === favoriteScopes.project ? folderClassNames.favoriteProject : null,
    isOpen ? folderClassNames.open : null,
  ]
    .filter(Boolean)
    .join(folderClassNames.joiner);

  return (
    <div
      className={className}
      style={{ "--depth": entry.depth } as CSSProperties}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={clearDragSource}
      title={entry.absPath}
      role="button"
      aria-expanded={isOpen}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === folderKeyboardKeys.enter || e.key === " ") {
          e.preventDefault();
          onToggle(entry.relPath);
        }
      }}
    >
      <Chevron
        size={11}
        aria-hidden
        className={hasChildren ? folderClassNames.chevron : folderClassNames.emptyChevron}
      />
      <Icon size={13} aria-hidden className="file-row-icon" />
      <span className="file-row-name">{entry.name}</span>
      {entry.isSymlink ? (
        <Link2 size={10} aria-hidden className="file-row-symlink" />
      ) : null}
      <button
        type="button"
        className="file-row-star"
        data-fav={fav ?? favoriteScopes.none}
        onClick={onStarClick}
        title={favTooltip(fav)}
        aria-label={favTooltip(fav)}
      >
        <Star size={12} aria-hidden />
        {fav === favoriteScopes.project ? (
          <Star size={12} aria-hidden className="file-row-star-second" />
        ) : null}
      </button>
    </div>
  );
}

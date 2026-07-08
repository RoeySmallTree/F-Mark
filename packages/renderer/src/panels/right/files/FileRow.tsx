import { type CSSProperties, useCallback, useRef } from "react";
import { Link2, Star } from "lucide-react";
import { iconForExtension } from "./iconForExtension.js";
import type { FavoriteScope, VisibleRow } from "./buildTreeView.js";
import { GIT_FILE_STATUSES, type GitFileStatus } from "@f-mark/shared";
import { useStore } from "../../../state/store.js";
import { usePresentFile } from "../../../shell/usePresentFile.js";
import {
  clearDragSource,
  setCircularDragImage,
} from "../../../drag/dragPreview.js";

export interface FileRowProps {
  row: VisibleRow;
  onCycleFav: (absPath: string, current: FavoriteScope) => void;
  changedStatusOverride?: GitFileStatus | null;
  onOpenFile?: (absPath: string) => void;
}

const FMARK_DRAG_TYPE = "application/x-fmark-file-path";

const fileRowStatusTokens = {
  binaryPrefix: "binary-",
} as const;

const fileDragValues = {
  textPlain: "text/plain",
  copy: "copy",
  iconSelector: ".file-row-icon",
  fallbackText: "F",
} as const;

const fileRowClassNames = {
  row: "file-row",
  ignored: "is-ignored",
  favoriteSession: "is-fav-session",
  favoriteProject: "is-fav-project",
  joiner: " ",
} as const;

const favoriteScopes = {
  session: "session",
  project: "project",
  none: "none",
} as const;

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

/* Compact label for the per-file "changed" badge. */
function changedBadge(status: string): { label: string; cls: string } {
  if (status.startsWith(fileRowStatusTokens.binaryPrefix)) {
    const base = status.slice(fileRowStatusTokens.binaryPrefix.length);
    return { label: badgeChar(base), cls: `is-${base}` };
  }
  return { label: badgeChar(status), cls: `is-${status}` };
}
function badgeChar(status: string): string {
  switch (status) {
    case GIT_FILE_STATUSES.added:
    case GIT_FILE_STATUSES.untracked:
      return "A";
    case GIT_FILE_STATUSES.deleted:
      return "D";
    case GIT_FILE_STATUSES.renamed:
      return "R";
    default:
      return "M";
  }
}

export function FileRow({
  row,
  onCycleFav,
  changedStatusOverride,
  onOpenFile,
}: FileRowProps): JSX.Element {
  const { entry, fav } = row;
  const { Icon, colorClass } = iconForExtension(entry.ext, entry.isDir, false);
  const presentFile = usePresentFile();
  /* "changed" badge: look up this file's git status under the selected scope's
     path_id (design §8.3). Directories never carry a badge. */
  const storeChangedStatus = useStore((s) => {
    if (entry.isDir) return null;
    const pathId = s.selectedPathId;
    if (pathId === null) return null;
    return s.gitChangedByPathId[pathId]?.[entry.relPath] ?? null;
  });
  const changedStatus = changedStatusOverride ?? storeChangedStatus;

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
      e.dataTransfer.setData(fileDragValues.textPlain, entry.absPath);
      e.dataTransfer.effectAllowed = fileDragValues.copy;
      setCircularDragImage(e.dataTransfer, e.currentTarget, {
        label: entry.name,
        iconSelector: fileDragValues.iconSelector,
        fallbackText: fileDragValues.fallbackText,
        tone: fileDragValues.copy,
      });
    },
    [entry.absPath, entry.name],
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
      if (onOpenFile !== undefined) onOpenFile(entry.absPath);
      else presentFile(entry.absPath);
    },
    [entry.absPath, onOpenFile, presentFile],
  );

  const onStarClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onCycleFav(entry.absPath, fav);
    },
    [entry.absPath, fav, onCycleFav],
  );

  const className = [
    fileRowClassNames.row,
    entry.ignored ? fileRowClassNames.ignored : null,
    fav === favoriteScopes.session ? fileRowClassNames.favoriteSession : null,
    fav === favoriteScopes.project ? fileRowClassNames.favoriteProject : null,
  ]
    .filter(Boolean)
    .join(fileRowClassNames.joiner);

  return (
    <div
      className={className}
      style={{ "--depth": entry.depth } as CSSProperties}
      draggable
      onDragStart={onDragStart}
      onDragEnd={clearDragSource}
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
      {changedStatus !== null ? (
        <span
          className={`file-row-changed ${changedBadge(changedStatus).cls}`}
          title={`Changed: ${changedStatus}`}
          aria-label={`Changed: ${changedStatus}`}
          data-testid="file-row-changed"
        >
          {changedBadge(changedStatus).label}
        </span>
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

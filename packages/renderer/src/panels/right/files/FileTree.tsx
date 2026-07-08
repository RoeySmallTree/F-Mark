import { FileRow } from "./FileRow.js";
import { FolderNode } from "./FolderNode.js";
import { TabEmptyState } from "../TabEmptyState.js";
import type { TabEmptyVariant } from "../tabEmptyArt.js";
import type { FavoriteScope, VisibleRow } from "./buildTreeView.js";
import type { GitFileStatus } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  filesNoMatch: "files-no-match",
  fileTreeEmpty: "file-tree-empty",
  fileTreeEmptyTestId: "file-tree-empty",
} as const;

export interface FileTreeProps {
  /* Root-level rows; folders carry their visible children inline. */
  rows: VisibleRow[];
  onToggleFolder: (relPath: string) => void;
  onCycleFav: (absPath: string, current: FavoriteScope) => void;
  changedByRelPath?: Record<string, GitFileStatus>;
  onOpenFile?: (absPath: string) => void;
  emptyVariant?: TabEmptyVariant;
}

/* Each folder + its descendants are rendered inside a `.folder-section`
   wrapper so the folder's sticky header is naturally bounded by that
   section. When the section's bottom passes the top of the scrollport,
   the sticky header scrolls out with it — producing the "next folder
   pushes the previous one out" effect the user expects. Files are
   rendered flat (no wrapper) since they have no sticky header. */
function renderRow(
  row: VisibleRow,
  onToggleFolder: (relPath: string) => void,
  onCycleFav: (absPath: string, current: FavoriteScope) => void,
  changedByRelPath: Record<string, GitFileStatus> | undefined,
  onOpenFile: ((absPath: string) => void) | undefined,
): JSX.Element {
  if (!row.entry.isDir) {
    return (
      <FileRow
        key={row.entry.absPath}
        row={row}
        onCycleFav={onCycleFav}
        changedStatusOverride={changedByRelPath?.[row.entry.relPath] ?? null}
        onOpenFile={onOpenFile}
      />
    );
  }
  return (
    <div key={row.entry.absPath} className="folder-section">
      <FolderNode row={row} onToggle={onToggleFolder} onCycleFav={onCycleFav} />
      {row.isOpen
        ? row.children.map((child) =>
            renderRow(
              child,
              onToggleFolder,
              onCycleFav,
              changedByRelPath,
              onOpenFile,
            ),
          )
        : null}
    </div>
  );
}

export function FileTree({
  rows,
  onToggleFolder,
  onCycleFav,
  changedByRelPath,
  onOpenFile,
  emptyVariant = NO_LOOSE_STRING_VALUES.filesNoMatch,
}: FileTreeProps): JSX.Element {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        variant={emptyVariant}
        fill
        className={NO_LOOSE_STRING_VALUES.fileTreeEmpty}
        testId={NO_LOOSE_STRING_VALUES.fileTreeEmptyTestId}
      />
    );
  }
  return (
    <div className="file-tree" role="tree">
      {rows.map((row) =>
        renderRow(
          row,
          onToggleFolder,
          onCycleFav,
          changedByRelPath,
          onOpenFile,
        ),
      )}
    </div>
  );
}

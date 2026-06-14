import { FileRow } from "./FileRow.js";
import { FolderNode } from "./FolderNode.js";
import type { FavoriteScope, VisibleRow } from "./buildTreeView.js";

export interface FileTreeProps {
  /* Root-level rows; folders carry their visible children inline. */
  rows: VisibleRow[];
  onToggleFolder: (relPath: string) => void;
  onCycleFav: (absPath: string, current: FavoriteScope) => void;
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
): JSX.Element {
  if (!row.entry.isDir) {
    return (
      <FileRow
        key={row.entry.absPath}
        row={row}
        onCycleFav={onCycleFav}
      />
    );
  }
  return (
    <div key={row.entry.absPath} className="folder-section">
      <FolderNode row={row} onToggle={onToggleFolder} onCycleFav={onCycleFav} />
      {row.isOpen
        ? row.children.map((child) =>
            renderRow(child, onToggleFolder, onCycleFav),
          )
        : null}
    </div>
  );
}

export function FileTree({
  rows,
  onToggleFolder,
  onCycleFav,
}: FileTreeProps): JSX.Element {
  if (rows.length === 0) {
    return <div className="file-tree-empty">no matches</div>;
  }
  return (
    <div className="file-tree" role="tree">
      {rows.map((row) => renderRow(row, onToggleFolder, onCycleFav))}
    </div>
  );
}

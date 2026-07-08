const NO_LOOSE_STRING_VALUES = {
  deleted: "deleted",
  binaryDeleted: "binary-deleted",
  renamed: "renamed",
  binaryRenamed: "binary-renamed",
} as const;

/* "Changed (not in tree)" section (design §8.3, review §6).

   /git/changed-files reports deleted / renamed-away paths that no longer exist
   in /files/tree, so the per-row badge on a tree row can never surface them. We
   list those absent-from-tree changed paths here as their own rows so a deleted
   (or renamed-old) file is still reachable.

   Opening:
   - deleted → open the OLD (now-absent) path; the diff endpoints read its base
     version from git and the working side is empty.
   - renamed → open the NEW path. The renamed file's OLD path no longer exists
     in the working tree, so opening the old path made /git/file-version + the
     media working-blob read an absent working file (empty / 404). The NEW path
     is the one that exists on the working side; the endpoints already pair it
     with the OLD path for the base read via the changed-file entry's old_path
     (round-2 review issue #6). */

import { useMemo } from "react";
import { FileX } from "lucide-react";
import type { GitFileStatus } from "@f-mark/shared";
import { useStore } from "../../../state/store.js";
import { usePresentFile } from "../../../shell/usePresentFile.js";

function joinRoot(root: string, rel: string): string {
  const r = root.replace(/\/+$/, "");
  return `${r}/${rel}`;
}

/* Only surface statuses whose path is genuinely gone from the working tree.
   Added/modified/untracked still have a live tree row to carry their badge. */
function isAbsentStatus(status: GitFileStatus): boolean {
  return (
    status === NO_LOOSE_STRING_VALUES.deleted ||
    status === NO_LOOSE_STRING_VALUES.binaryDeleted ||
    status === NO_LOOSE_STRING_VALUES.renamed ||
    status === NO_LOOSE_STRING_VALUES.binaryRenamed
  );
}

export function ChangedAbsentFiles(): JSX.Element | null {
  const activePath = useStore((s) => s.selectedPath ?? s.activePath);
  const activePathId = useStore((s) => s.selectedPathId ?? s.activePathId);
  const presentFile = usePresentFile();
  const changed = useStore((s) =>
    activePathId !== null ? s.gitChangedByPathId[activePathId] : undefined,
  );
  const renames = useStore((s) =>
    activePathId !== null ? s.gitRenamesByPathId[activePathId] : undefined,
  );
  const tree = useStore((s) =>
    activePath !== null ? s.filesTreeByPath[activePath] : null,
  );

  /* Rel paths that DO exist in the tree — anything changed but not here is the
     absent set we surface. */
  const presentRels = useMemo(() => {
    const set = new Set<string>();
    if (tree !== null && tree !== undefined) {
      for (const e of tree.entries) {
        if (!e.isDir) set.add(e.relPath);
      }
    }
    return set;
  }, [tree]);

  const rows = useMemo(() => {
    if (changed === undefined || activePath === null) return [];
    const renameMap = renames ?? {};
    const out: {
      rel: string;
      status: GitFileStatus;
      openAbs: string;
    }[] = [];
    const seen = new Set<string>();
    for (const [rel, status] of Object.entries(changed)) {
      if (!isAbsentStatus(status)) continue;
      if (presentRels.has(rel)) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);
      /* Renamed: `rel` is the OLD path (absent from the tree). Open the NEW
         path — it exists on the working side and the diff endpoints pair it
         with old_path for the base read (round-2 #6). Deleted: open the old
         path; only its base version exists. */
      const isRename = status === NO_LOOSE_STRING_VALUES.renamed || status === NO_LOOSE_STRING_VALUES.binaryRenamed;
      const newPath = isRename ? renameMap[rel] : undefined;
      const openRel = newPath ?? rel;
      out.push({ rel, status, openAbs: joinRoot(activePath, openRel) });
    }
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
  }, [changed, renames, presentRels, activePath]);

  if (rows.length === 0) return null;

  return (
    <div className="files-changed-absent" data-testid="files-changed-absent">
      <div className="files-changed-absent-title">Changed (not in tree)</div>
      {rows.map((r) => (
        <button
          key={r.rel}
          type="button"
          className={`files-changed-absent-row is-${r.status.replace("binary-", "")}`}
          title={`${r.status}: ${r.rel}`}
          onClick={() => {
            presentFile(r.openAbs);
          }}
          data-testid="files-changed-absent-row"
        >
          <FileX size={12} aria-hidden className="files-changed-absent-icon" />
          <span className="files-changed-absent-name">{r.rel}</span>
          <span className="files-changed-absent-badge">
            {r.status.includes(NO_LOOSE_STRING_VALUES.deleted) ? "D" : "R"}
          </span>
        </button>
      ))}
    </div>
  );
}

import { useCallback } from "react";
import { useStore } from "../../../state/store.js";

export interface FilesSearchChipsProps {
  exts: string[];
  selected: string[];
}

export function FilesSearchChips({
  exts,
  selected,
}: FilesSearchChipsProps): JSX.Element | null {
  const setFilesSearch = useStore((s) => s.setFilesSearch);
  const selectedSet = new Set(selected);

  const toggle = useCallback(
    (ext: string) => {
      const next = selectedSet.has(ext)
        ? selected.filter((e) => e !== ext)
        : [...selected, ext];
      setFilesSearch({ exts: next });
    },
    [selected, selectedSet, setFilesSearch],
  );

  if (exts.length === 0 && selected.length === 0) return null;

  return (
    <div className="files-chips" role="group" aria-label="Filter by file type">
      {exts.map((ext) => (
        <button
          key={ext}
          type="button"
          className={`files-chip ${selectedSet.has(ext) ? "is-on" : ""}`}
          onClick={() => toggle(ext)}
          aria-pressed={selectedSet.has(ext)}
        >
          .{ext}
        </button>
      ))}
    </div>
  );
}

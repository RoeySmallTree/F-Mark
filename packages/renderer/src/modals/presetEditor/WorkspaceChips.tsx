import { useMemo, type JSX } from "react";
import { Check } from "lucide-react";
import { useStore } from "../../state/store.js";
import { pathLabel, workspaceChipPaths } from "./model.js";

interface WorkspaceChipsProps {
  /* Currently-selected workspace paths. */
  selected: ReadonlyArray<string>;
  onToggle(path: string): void;
  ariaLabel: string;
}

export function WorkspaceChips({
  selected,
  onToggle,
  ariaLabel,
}: WorkspaceChipsProps): JSX.Element {
  const activePath = useStore((state) => state.activePath);
  const knownPaths = useStore((state) => state.knownPaths);
  const favorites = useStore((state) => state.favorites);
  const chips = useMemo(
    () => workspaceChipPaths({ activePath, favorites, knownPaths, selected }),
    [activePath, favorites, knownPaths, selected],
  );

  if (chips.length === 0) {
    return (
      <div className="ws-chips-empty">
        No known workspaces yet. Visit a folder to add it.
      </div>
    );
  }

  return (
    <div className="ws-chips" role="group" aria-label={ariaLabel}>
      {chips.map((path) => (
        <WorkspaceChip
          key={path}
          path={path}
          activePath={activePath}
          selected={selected.includes(path)}
          label={pathLabel(path, favorites)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function WorkspaceChip({
  path,
  activePath,
  selected,
  label,
  onToggle,
}: {
  path: string;
  activePath: string | null;
  selected: boolean;
  label: string;
  onToggle(path: string): void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ws-chip${selected ? " on" : ""}`}
      onClick={() => onToggle(path)}
      aria-pressed={selected}
      title={path}
    >
      {selected ? (
        <Check size={11} aria-hidden className="ws-chip-check" />
      ) : null}
      <span className="ws-chip-label">{label}</span>
      {path === activePath ? (
        <span className="ws-chip-current">current</span>
      ) : null}
    </button>
  );
}

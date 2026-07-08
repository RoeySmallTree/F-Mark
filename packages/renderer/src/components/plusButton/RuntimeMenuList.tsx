import type { JSX } from "react";
import { RuntimeMenuItem } from "./RuntimeMenuItem.js";
import type { RuntimeMenuItemModel } from "./types.js";

interface RuntimeMenuListProps {
  items: RuntimeMenuItemModel[];
  onSpawnRuntime(item: RuntimeMenuItemModel): void;
  onAccessModeChange(id: string, mode: string): void;
  onModelChange(id: string, model: string): void;
  expandedRuntimeId: string | null;
  onEffortChange(id: string, effort: string): void;
  onToggleOptions(id: string): void;
}

export function RuntimeMenuList({
  items,
  onAccessModeChange,
  onModelChange,
  expandedRuntimeId,
  onEffortChange,
  onSpawnRuntime,
  onToggleOptions,
}: RuntimeMenuListProps): JSX.Element {
  return (
    <>
      {items.map((item) => (
        <RuntimeMenuItem
          key={item.id}
          item={item}
          expanded={expandedRuntimeId === item.id}
          onAccessModeChange={(mode) => onAccessModeChange(item.id, mode)}
          onModelChange={(model) => onModelChange(item.id, model)}
          onEffortChange={(effort) => onEffortChange(item.id, effort)}
          onToggleOptions={() => onToggleOptions(item.id)}
          onClick={() => onSpawnRuntime(item)}
        />
      ))}
    </>
  );
}

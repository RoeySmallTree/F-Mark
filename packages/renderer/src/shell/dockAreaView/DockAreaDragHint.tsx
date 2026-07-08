import type { JSX } from "react";
import { GripVertical } from "lucide-react";

export function DockAreaDragHint(): JSX.Element {
  return (
    <span className="dock-drag-hint" aria-hidden="true">
      <GripVertical size={13} />
    </span>
  );
}

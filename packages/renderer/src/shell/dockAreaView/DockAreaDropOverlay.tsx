import type { JSX } from "react";

export function DockAreaDropOverlay({ label }: { label: string }): JSX.Element {
  return (
    <div className="dock-drop-overlay" aria-hidden="true">
      <span>Drop to place</span>
      <small>{dropTargetLabel(label)}</small>
    </div>
  );
}

function dropTargetLabel(label: string): string {
  return label.replace(/\s+tabs$/i, "");
}

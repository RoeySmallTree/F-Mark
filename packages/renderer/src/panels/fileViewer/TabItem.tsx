import { type CSSProperties, useCallback } from "react";
import { Pin, PinOff, X } from "lucide-react";
import { iconForExtension } from "../right/files/iconForExtension.js";
import { basenameOf, extOf } from "./renderers/pickRenderer.js";

export interface TabItemProps {
  path: string;
  pinned: boolean;
  active: boolean;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onTogglePin: (path: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, path: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, path: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, path: string) => void;
}

export function TabItem({
  path,
  pinned,
  active,
  onActivate,
  onClose,
  onTogglePin,
  onDragStart,
  onDragOver,
  onDrop,
}: TabItemProps): JSX.Element {
  const name = basenameOf(path);
  const ext = extOf(path);
  const { Icon, colorClass } = iconForExtension(ext, false, false);

  const handleClick = useCallback(() => onActivate(path), [onActivate, path]);
  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(path);
    },
    [onClose, path],
  );
  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTogglePin(path);
    },
    [onTogglePin, path],
  );

  const className = [
    "fv-tab",
    active ? "is-active" : null,
    pinned ? "is-pinned" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      data-flip-id={path}
      style={{ "--fv-tab-pinned": pinned ? 1 : 0 } as CSSProperties}
      onClick={handleClick}
      draggable
      onDragStart={(e) => onDragStart(e, path)}
      onDragOver={(e) => onDragOver(e, path)}
      onDrop={(e) => onDrop(e, path)}
      title={path}
      role="tab"
      aria-selected={active}
    >
      <Icon
        size={12}
        aria-hidden
        className={`fv-tab-icon ${colorClass}`.trim()}
      />
      <span className="fv-tab-name">{name}</span>
      <button
        type="button"
        className="fv-tab-btn"
        onClick={handlePin}
        title={pinned ? "Unpin" : "Pin"}
        aria-label={pinned ? "Unpin tab" : "Pin tab"}
      >
        {pinned ? <PinOff size={11} aria-hidden /> : <Pin size={11} aria-hidden />}
      </button>
      <button
        type="button"
        className="fv-tab-btn fv-tab-close"
        onClick={handleClose}
        title="Close"
        aria-label="Close tab"
      >
        <X size={11} aria-hidden />
      </button>
    </div>
  );
}

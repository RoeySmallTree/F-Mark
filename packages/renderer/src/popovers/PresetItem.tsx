/* PresetItem — a single clickable row inside <PresetsPopover>.
   Mirrors design.html `.preset-item .preset-icon .preset-text .preset-name
   .preset-body`. The body is truncated to ~90 chars and ellipsised by CSS
   (single-line, overflow:hidden) — we still slice in JS so very long bodies
   never blow up the layout when measuring. */

import type { JSX } from "react";
import { Pencil } from "lucide-react";
import type { Preset } from "@f-mark/shared";

interface Props {
  preset: Preset;
  onPick(preset: Preset): void;
  /* Optional — when provided, a pencil icon shows on the row that opens
     the editor for this preset. Currently passed only for `source:custom`
     presets; built-ins / project presets are read-only. */
  onEdit?(preset: Preset): void;
}

const BODY_PREVIEW_LEN = 90;

function previewBody(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= BODY_PREVIEW_LEN) return flat;
  return `${flat.slice(0, BODY_PREVIEW_LEN)}…`;
}

export function PresetItem({ preset, onPick, onEdit }: Props): JSX.Element {
  const icon = preset.icon ?? "✨";
  const editable = onEdit !== undefined;
  return (
    <div className={`preset-item${editable ? " preset-item-editable" : ""}`}>
      <button
        type="button"
        className="preset-item-pick"
        onClick={() => onPick(preset)}
        aria-label={`Insert preset: ${preset.name}`}
      >
        <span className="preset-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="preset-text">
          <div className="preset-name">{preset.name}</div>
          <div className="preset-body">{previewBody(preset.body)}</div>
        </div>
      </button>
      {editable && (
        <button
          type="button"
          className="preset-item-edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(preset);
          }}
          aria-label={`Edit preset: ${preset.name}`}
          title="Edit preset"
        >
          <Pencil size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

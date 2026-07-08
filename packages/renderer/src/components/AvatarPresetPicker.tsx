import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import {
  AVATAR_PRESETS,
  defaultAvatarPreset,
  getAvatarPreset,
} from "@f-mark/shared";
import { AvatarArt } from "./participantAvatar/AvatarArt.js";
import "./avatarPresetPicker.css";

interface AvatarPresetPickerProps {
  seed: string;
  value: string | undefined;
  onChange(id: string): void;
  color?: string;
  customPreviewColor?: string | null;
  hexInput?: string;
  hexValid?: boolean;
  presetColors?: readonly string[];
  onHexInputChange?(value: string): void;
  onPresetColor?(color: string): void;
}

export function AvatarPresetPicker({
  seed,
  value,
  onChange,
  color,
  customPreviewColor,
  hexInput,
  hexValid = true,
  presetColors,
  onHexInputChange,
  onPresetColor,
}: AvatarPresetPickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = getAvatarPreset(value) ?? defaultAvatarPreset(seed);
  const hasColorControls =
    color !== undefined &&
    presetColors !== undefined &&
    hexInput !== undefined &&
    onHexInputChange !== undefined &&
    onPresetColor !== undefined;
  const avatarColorStyle =
    color !== undefined
      ? ({ "--avatar-color": color } as CSSProperties)
      : undefined;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current?.contains(event.target as Node) !== true) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`avatar-preset-picker${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="avatar-preset-trigger"
        aria-expanded={open}
        aria-controls="avatar-preset-panel"
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        {/* Second bezel — live ASCII art preview */}
        <span
          className="avatar-preset-trigger-preview"
          style={avatarColorStyle}
          aria-hidden="true"
        >
          <AvatarArt lines={current.lines} tones={current.tones} />
        </span>
        <span className="avatar-preset-trigger-copy">
          <span className="avatar-preset-trigger-label">Avatar</span>
          <span className="avatar-preset-trigger-value">{current.label}</span>
        </span>
        {/* Ultra-light inline chevron — 1.5px stroke */}
        <svg
          className="avatar-preset-trigger-chevron"
          width="12"
          height="7"
          viewBox="0 0 12 7"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1L6 6L11 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <section
          id="avatar-preset-panel"
          className="avatar-preset-panel"
          aria-label="Avatar glyph catalog"
        >
          {/* Inner core — second bezel */}
          <div className="avatar-preset-panel-inner">
            <header className="avatar-preset-panel-head">
              <div className="avatar-preset-panel-title">
                <strong>Glyph catalog</strong>
                <span>Monochrome ASCII silhouettes</span>
              </div>
              <span className="avatar-preset-panel-count" aria-label={`${AVATAR_PRESETS.length} presets`}>
                {AVATAR_PRESETS.length}
              </span>
            </header>
            <div className="avatar-preset-scroll" role="listbox" aria-label="Avatar presets">
              <div className="avatar-preset-grid" style={avatarColorStyle}>
                {AVATAR_PRESETS.map((preset, i) => {
                  const selected = preset.id === current.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={preset.label}
                      // CSS custom prop drives the stagger delay
                      style={{ "--tile-i": i } as CSSProperties}
                      className={`avatar-preset-tile${selected ? " selected" : ""}`}
                      onClick={() => {
                        onChange(preset.id);
                        setOpen(false);
                      }}
                    >
                      <span className="avatar-preset-tile-ring" aria-hidden="true">
                        <AvatarArt lines={preset.lines} tones={preset.tones} />
                      </span>
                      <span className="avatar-preset-tile-label">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {hasColorControls ? (
              <section
                className="avatar-preset-colors profile-color-control"
                aria-label="Avatar color controls"
              >
                <div className="avatar-preset-colors-head">
                  <strong>Color</strong>
                  <span>Applied to the ASCII glyph characters</span>
                </div>
                <div className="color-row avatar-preset-color-row" aria-label="Preset colors">
                  {presetColors.map((presetColor) => {
                    const active = presetColor.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={presetColor}
                        type="button"
                        className={`swatch avatar-preset-color-swatch${active ? " active" : ""}`}
                        style={{ "--swatch-color": presetColor } as CSSProperties}
                        onClick={() => onPresetColor(presetColor)}
                        title={presetColor}
                        aria-label={`Color ${presetColor}`}
                        aria-pressed={active}
                      />
                    );
                  })}
                </div>
                <div className="profile-hex-field avatar-preset-hex-field">
                  <input
                    type="text"
                    className={`swatch-hex${
                      !hexValid && hexInput.length > 0 ? " invalid" : ""
                    }`}
                    value={hexInput}
                    onChange={(event) => onHexInputChange(event.target.value)}
                    placeholder="#hex"
                    aria-label="Custom hex color"
                  />
                  {customPreviewColor !== null && customPreviewColor !== undefined ? (
                    <span
                      className="swatch swatch-custom-preview avatar-preset-color-swatch active"
                      style={{ "--swatch-color": customPreviewColor } as CSSProperties}
                      title={customPreviewColor}
                      role="img"
                      aria-label={`Custom color preview ${customPreviewColor}`}
                    />
                  ) : null}
                  {!hexValid && hexInput.length > 0 ? (
                    <span className="profile-inline-error">invalid hex</span>
                  ) : null}
                </div>
              </section>
            ) : null}
            <footer className="avatar-preset-panel-foot">
              Stored as a preset id — not an image upload.
            </footer>
          </div>
        </section>
      ) : null}
    </div>
  );
}

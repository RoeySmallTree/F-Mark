import type { JSX } from "react";
import { PRESET_COLORS } from "./model.js";

interface ProfileColorControlProps {
  color: string;
  customPreviewColor: string | null;
  hexInput: string;
  hexValid: boolean;
  onHexInputChange(value: string): void;
  onPresetColor(color: string): void;
}

export function ProfileColorControl({
  color,
  customPreviewColor,
  hexInput,
  hexValid,
  onHexInputChange,
  onPresetColor,
}: ProfileColorControlProps): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-l">Color</div>
      <div className="settings-r">
        <div className="profile-color-control">
          <div className="color-row" aria-label="Preset colors">
            {PRESET_COLORS.map((presetColor) => {
              const active = presetColor.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={presetColor}
                  type="button"
                  className={`swatch${active ? " active" : ""}`}
                  style={{ background: presetColor }}
                  onClick={() => onPresetColor(presetColor)}
                  title={presetColor}
                  aria-label={`Color ${presetColor}`}
                  aria-pressed={active}
                />
              );
            })}
          </div>
          <div className="profile-hex-field">
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
            {customPreviewColor !== null ? (
              <span
                className="swatch swatch-custom-preview active"
                style={{ background: customPreviewColor }}
                title={customPreviewColor}
                role="img"
                aria-label={`Custom color preview ${customPreviewColor}`}
              />
            ) : null}
            {!hexValid && hexInput.length > 0 ? (
              <span className="profile-inline-error">invalid hex</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

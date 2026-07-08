import type { JSX } from "react";
import type { Participant } from "@f-mark/shared";
import { AvatarPresetPicker } from "../../../components/AvatarPresetPicker.js";
import { ParticipantAvatar } from "../../../components/ParticipantAvatar.js";
import { PRESET_COLORS } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  usProfile: "us-profile",
  xl: "xl",
} as const;

interface ProfileAvatarControlProps {
  avatarPreset: string | undefined;
  color: string;
  currentUserId: string | null;
  customPreviewColor: string | null;
  hexInput: string;
  hexValid: boolean;
  onAvatarPresetChange(id: string): void;
  onHexInputChange(value: string): void;
  onPresetColor(color: string): void;
  previewParticipant: Participant;
}

export function ProfileAvatarControl({
  avatarPreset,
  color,
  currentUserId,
  customPreviewColor,
  hexInput,
  hexValid,
  onAvatarPresetChange,
  onHexInputChange,
  onPresetColor,
  previewParticipant,
}: ProfileAvatarControlProps): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-l">Avatar</div>
      <div className="settings-r">
        <div className="profile-photo-control">
          <div className="profile-avatar-shell">
            <ParticipantAvatar
              participantId={currentUserId ?? NO_LOOSE_STRING_VALUES.usProfile}
              participant={previewParticipant}
              size={NO_LOOSE_STRING_VALUES.xl}
              title={previewParticipant.name}
            />
          </div>
          <div className="profile-photo-actions">
            <AvatarPresetPicker
              seed={currentUserId ?? NO_LOOSE_STRING_VALUES.usProfile}
              value={avatarPreset}
              color={color}
              customPreviewColor={customPreviewColor}
              hexInput={hexInput}
              hexValid={hexValid}
              presetColors={PRESET_COLORS}
              onChange={onAvatarPresetChange}
              onHexInputChange={onHexInputChange}
              onPresetColor={onPresetColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

import type { JSX } from "react";
import type { ProfileController } from "./useProfileController.js";
import { ProfileAvatarControl } from "./ProfileAvatarControl.js";
import { ProfileForm } from "./ProfileForm.js";

interface ProfileViewProps {
  controller: ProfileController;
}

export function ProfileView({ controller }: ProfileViewProps): JSX.Element {
  return (
    <>
      <h3 className="settings-h">Profile</h3>
      <ProfileAvatarControl
        avatarPreset={controller.avatarPreset}
        color={controller.color}
        currentUserId={controller.currentUserId}
        customPreviewColor={controller.customPreviewColor}
        hexInput={controller.hexInput}
        hexValid={controller.hexValid}
        onAvatarPresetChange={controller.setAvatarPreset}
        onHexInputChange={controller.setHexInputValue}
        onPresetColor={controller.selectPresetColor}
        previewParticipant={controller.previewParticipant}
      />
      <ProfileForm controller={controller} />
    </>
  );
}

import type { JSX } from "react";
import { ProfileIdentityRow } from "./ProfileIdentityRow.js";
import { ProfileNameField } from "./ProfileNameField.js";
import { ProfileSaveRow } from "./ProfileSaveRow.js";
import type { ProfileController } from "./useProfileController.js";

interface ProfileFormProps {
  controller: ProfileController;
}

export function ProfileForm({ controller }: ProfileFormProps): JSX.Element {
  return (
    <>
      <ProfileNameField name={controller.name} onNameChange={controller.setName} />
      <ProfileIdentityRow currentUserId={controller.currentUserId} />
      <ProfileSaveRow
        dirty={controller.dirty}
        error={controller.error}
        onSave={controller.save}
        savedAt={controller.savedAt}
        saving={controller.saving}
      />
    </>
  );
}

/* Profile section — Settings → Profile.
   Edits the machine-wide F-Mark user profile. Project participants still own
   event author ids, but display identity is stored in global config. */

import type { JSX } from "react";
import { ProfileView } from "./profile/ProfileView.js";
import { useProfileController } from "./profile/useProfileController.js";

export function Profile(): JSX.Element {
  return <ProfileView controller={useProfileController()} />;
}

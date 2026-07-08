import type { JSX } from "react";

interface ProfileNameFieldProps {
  name: string;
  onNameChange(name: string): void;
}

export function ProfileNameField({
  name,
  onNameChange,
}: ProfileNameFieldProps): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-l">Display name</div>
      <div className="settings-r">
        <div className="profile-name-field">
          <input
            className="form-input profile-name-input"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            aria-label="Display name"
          />
        </div>
      </div>
    </div>
  );
}

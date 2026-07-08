const NO_LOOSE_STRING_VALUES = {
  usYou: "us-you",
  user: "user",
  you: "You",
  xl: "xl",
} as const;

/* ProfileStep — the opener. Headline does the "who the f**k are you?" bit (in
   the modal head); this body softens it and collects a display name + avatar
   preset. Values are applied to the machine-wide F-Mark user profile at finish. */

import type { JSX } from "react";
import { AvatarPresetPicker } from "../../components/AvatarPresetPicker.js";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";

export interface ProfileStepProps {
  name: string;
  avatarPreset: string | undefined;
  color: string;
  onNameChange(name: string): void;
  onAvatarPresetChange(id: string): void;
}

export function ProfileStep({
  name,
  avatarPreset,
  color,
  onNameChange,
  onAvatarPresetChange,
}: ProfileStepProps): JSX.Element {
  return (
    <div className="ob-profile">
      <p className="ob-profile-lead">
        …ok, kidding. 😄 But really — drop a name and a face so your agents (and
        anyone you share a session with) know who they&apos;re working with. You
        can change all of this later.
      </p>

      <div className="ob-profile-card">
        <ParticipantAvatar
          participantId={NO_LOOSE_STRING_VALUES.usYou}
          participant={{
            kind: NO_LOOSE_STRING_VALUES.user,
            name: name.length > 0 ? name : NO_LOOSE_STRING_VALUES.you,
            color,
            avatar_preset: avatarPreset,
          }}
          size={NO_LOOSE_STRING_VALUES.xl}
          title={name.length > 0 ? name : "You"}
        />
        <div className="ob-profile-photo">
          <AvatarPresetPicker
            seed={NO_LOOSE_STRING_VALUES.usYou}
            value={avatarPreset}
            onChange={onAvatarPresetChange}
          />
          <span className="ob-hint">Pick a character avatar. Optional.</span>
        </div>
      </div>

      <div className="ob-profile-field">
        <label className="form-label" htmlFor="ob-name">
          YOUR NAME
        </label>
        <input
          id="ob-name"
          className="form-input"
          placeholder="e.g. Roey"
          value={name}
          autoFocus
          aria-label="Your name"
          onChange={(e) => onNameChange(e.target.value)}
        />
        <div className="form-hint">
          Shown on everything you post. Leave blank to stay “You”.
        </div>
      </div>
    </div>
  );
}

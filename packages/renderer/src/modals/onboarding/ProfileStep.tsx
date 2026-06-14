/* ProfileStep — the opener. Headline does the "who the f**k are you?" bit (in
   the modal head); this body softens it and collects a display name + avatar.
   Reuses the avatar plumbing from Settings → Profile (shared size/mime/byte
   limits + ParticipantAvatar). The values are applied to the chosen project's
   user participant at finish. */

import { useRef, useState, type JSX } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import {
  PARTICIPANT_AVATAR_DATA_URL_MAX_LENGTH,
  PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES,
  PARTICIPANT_AVATAR_IMAGE_MAX_BYTES,
} from "@f-mark/shared";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";

const AVATAR_MIME = new Set<string>(PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES);
const AVATAR_ACCEPT = PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES.join(",");

function avatarLimitLabel(): string {
  return `${Math.floor(PARTICIPANT_AVATAR_IMAGE_MAX_BYTES / 1024)} KB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image file."));
    });
    reader.addEventListener("error", () =>
      reject(new Error("Could not read image file.")),
    );
    reader.readAsDataURL(file);
  });
}

export interface ProfileStepProps {
  name: string;
  avatarDataUrl: string | undefined;
  color: string;
  onNameChange(name: string): void;
  onAvatarChange(dataUrl: string | undefined): void;
}

export function ProfileStep({
  name,
  avatarDataUrl,
  color,
  onNameChange,
  onAvatarChange,
}: ProfileStepProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    if (!AVATAR_MIME.has(file.type)) {
      setError("Choose a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > PARTICIPANT_AVATAR_IMAGE_MAX_BYTES) {
      setError(`Image must be ${avatarLimitLabel()} or smaller.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > PARTICIPANT_AVATAR_DATA_URL_MAX_LENGTH) {
        setError(`Image must be ${avatarLimitLabel()} or smaller.`);
        return;
      }
      setError(null);
      onAvatarChange(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="ob-profile">
      <p className="ob-profile-lead">
        …ok, kidding. 😄 But really — drop a name and a face so your agents (and
        anyone you share a session with) know who they&apos;re working with. You
        can change all of this later.
      </p>

      <div className="ob-profile-card">
        <ParticipantAvatar
          participantId="us-you"
          participant={{
            kind: "user",
            name: name.length > 0 ? name : "You",
            color,
            avatar_data_url: avatarDataUrl,
          }}
          size="xl"
          title={name.length > 0 ? name : "You"}
        />
        <div className="ob-profile-photo">
          <div className="ob-profile-photo-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus size={14} aria-hidden /> Choose image
            </button>
            {avatarDataUrl !== undefined ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  onAvatarChange(undefined);
                  setError(null);
                }}
              >
                <Trash2 size={14} aria-hidden /> Remove
              </button>
            ) : null}
          </div>
          <span className="ob-hint">
            PNG, JPEG, WebP, or GIF up to {avatarLimitLabel()}. Optional.
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            aria-label="Upload profile image"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              void choose(file);
            }}
          />
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

      {error !== null ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

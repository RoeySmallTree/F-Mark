/* Profile section — Settings → Profile.
   Reads the current user participant from store. Editable name, color, and
   avatar image. Save -> client.updateParticipant. */

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import {
  PARTICIPANT_AVATAR_DATA_URL_MAX_LENGTH,
  PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES,
  PARTICIPANT_AVATAR_IMAGE_MAX_BYTES,
  type UpdateParticipantPatch,
} from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { useStore } from "../../state/store.js";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";

const PRESET_COLORS = [
  "#2a5fa8",
  "#3d7a4f",
  "#b86a1f",
  "#8a2a8a",
  "#a83a3a",
  "#1a1714",
  "#5b9dff",
  "#cb4b16",
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const AVATAR_MIME_TYPES = new Set<string>(
  PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES,
);
const AVATAR_ACCEPT = PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES.join(",");

function avatarLimitLabel(): string {
  return `${Math.floor(PARTICIPANT_AVATAR_IMAGE_MAX_BYTES / 1024)} KB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image file."));
    });
    reader.addEventListener("error", () => {
      reject(new Error("Could not read image file."));
    });
    reader.readAsDataURL(file);
  });
}

export function Profile(): JSX.Element {
  const token = useStore((s) => s.token);
  const currentUserId = useStore((s) => s.currentUserId);
  const participants = useStore((s) => s.participants);
  const setParticipants = useStore((s) => s.setParticipants);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const user = currentUserId !== null ? participants[currentUserId] : undefined;

  const [name, setName] = useState<string>(user?.name ?? "");
  const [color, setColor] = useState<string>(user?.color ?? PRESET_COLORS[0]!);
  const [hexInput, setHexInput] = useState<string>(user?.color ?? "");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(
    user?.avatar_data_url,
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-sync if the store changes (e.g. on first hydration).
  useEffect(() => {
    if (user !== undefined) {
      setName(user.name);
      setColor(user.color);
      setHexInput(user.color);
      setAvatarDataUrl(user.avatar_data_url);
    }
  }, [user?.name, user?.color, user?.avatar_data_url]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    if (user === undefined) return false;
    return (
      name.trim() !== user.name ||
      color.toLowerCase() !== user.color.toLowerCase() ||
      (avatarDataUrl ?? null) !== (user.avatar_data_url ?? null)
    );
  }, [name, color, avatarDataUrl, user]);

  const hexValid = useMemo(() => HEX_RE.test(hexInput), [hexInput]);
  const customPreviewColor = useMemo(() => {
    if (!HEX_RE.test(hexInput)) return null;
    const normalized = hexInput.toLowerCase();
    return PRESET_COLORS.some((c) => c.toLowerCase() === normalized)
      ? null
      : hexInput;
  }, [hexInput]);

  async function chooseAvatar(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setSavedAt(null);
    if (!AVATAR_MIME_TYPES.has(file.type)) {
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
      setAvatarDataUrl(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function save(): Promise<void> {
    if (currentUserId === null || user === undefined) return;
    if (name.trim().length === 0) {
      setError("Name cannot be empty.");
      return;
    }
    if (!HEX_RE.test(color)) {
      setError("Color must be a 6-digit hex like #2a5fa8.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const patch: UpdateParticipantPatch = {
        name: name.trim(),
        color,
      };
      if ((avatarDataUrl ?? null) !== (user.avatar_data_url ?? null)) {
        patch.avatar_data_url = avatarDataUrl ?? null;
      }
      const updated = await client.updateParticipant(currentUserId, patch);
      // Update local store with the patched participant.
      const next = { ...participants };
      const nextUser = {
        ...user,
        kind: updated.kind,
        name: updated.name,
        color: updated.color,
      };
      if (updated.avatar_data_url !== undefined) {
        nextUser.avatar_data_url = updated.avatar_data_url;
      } else {
        delete nextUser.avatar_data_url;
      }
      next[currentUserId] = nextUser;
      setParticipants(next);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (user === undefined || currentUserId === null) {
    return (
      <>
        <h3 className="settings-h">Profile</h3>
        <div className="settings-sub">
          No user participant found for the active path. Create a session in
          this folder to initialize <code className="codish">.f-mark/participants.json</code>.
        </div>
      </>
    );
  }

  return (
    <>
      <h3 className="settings-h">Profile</h3>
      <div className="settings-sub">
        Your identity in this project. Stored in <code className="codish">.f-mark/participants.json</code>.
      </div>
      <div className="settings-row">
        <div className="settings-l">Photo</div>
        <div className="settings-r">
          <div className="profile-photo-control">
            <ParticipantAvatar
              participantId={currentUserId}
              participant={{ ...user, avatar_data_url: avatarDataUrl }}
              size="xl"
              title={user.name}
            />
            <div className="profile-photo-actions">
              <button
                type="button"
                className="btn-ghost profile-photo-btn"
                onClick={() => avatarInputRef.current?.click()}
              >
                <ImagePlus size={14} aria-hidden="true" />
                Choose image
              </button>
              {avatarDataUrl !== undefined ? (
                <button
                  type="button"
                  className="btn-ghost profile-photo-btn"
                  onClick={() => {
                    setAvatarDataUrl(undefined);
                    setSavedAt(null);
                    setError(null);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Remove
                </button>
              ) : null}
              <input
                ref={avatarInputRef}
                type="file"
                accept={AVATAR_ACCEPT}
                aria-label="Upload profile image"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  void chooseAvatar(file);
                }}
              />
              <span className="profile-photo-hint">
                PNG, JPEG, WebP, or GIF up to {avatarLimitLabel()}.
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-l">Display name</div>
        <div className="settings-r">
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: 240 }}
            aria-label="Display name"
          />
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-l">Identity</div>
        <div className="settings-r">
          <code className="codish">{currentUserId}</code>
          <span
            style={{ color: "var(--ink-4)", fontSize: 11.5, marginLeft: 8 }}
          >
            generated when project initialized
          </span>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-l">Color</div>
        <div className="settings-r">
          <div className="color-row">
            {PRESET_COLORS.map((c) => {
              const active = c.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  className={`swatch${active ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => {
                    setColor(c);
                    setHexInput(c);
                  }}
                  title={c}
                  aria-label={`Color ${c}`}
                  aria-pressed={active}
                />
              );
            })}
            <input
              type="text"
              className="swatch-hex"
              value={hexInput}
              onChange={(e) => {
                const v = e.target.value;
                setHexInput(v);
                if (HEX_RE.test(v)) setColor(v);
              }}
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
              <span
                style={{ fontSize: 11, color: "var(--rose)", marginLeft: 4 }}
              >
                invalid hex
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className="settings-row"
        style={{ borderBottom: 0, paddingBottom: 4 }}
      >
        <div className="settings-l"></div>
        <div
          className="settings-r"
          style={{ display: "flex", gap: 10, alignItems: "center" }}
        >
          <button
            type="button"
            className="btn-solid"
            disabled={!dirty || saving}
            onClick={() => {
              void save();
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {error !== null ? (
            <span style={{ color: "var(--rose)", fontSize: 12 }}>{error}</span>
          ) : null}
          {error === null && savedAt !== null ? (
            <span style={{ color: "var(--green)", fontSize: 12 }}>Saved.</span>
          ) : null}
        </div>
      </div>
    </>
  );
}

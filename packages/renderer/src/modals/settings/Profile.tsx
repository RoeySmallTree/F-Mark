/* Profile section — Settings → Profile.
   Reads the current user participant from store. Editable name + color (8
   preset swatches + a custom hex input). Save → client.updateParticipant. */

import { useEffect, useMemo, useState, type JSX } from "react";
import { createClient } from "../../api/client.js";
import { useStore } from "../../state/store.js";

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

export function Profile(): JSX.Element {
  const token = useStore((s) => s.token);
  const currentUserId = useStore((s) => s.currentUserId);
  const participants = useStore((s) => s.participants);
  const setParticipants = useStore((s) => s.setParticipants);

  const user = currentUserId !== null ? participants[currentUserId] : undefined;

  const [name, setName] = useState<string>(user?.name ?? "");
  const [color, setColor] = useState<string>(user?.color ?? PRESET_COLORS[0]!);
  const [hexInput, setHexInput] = useState<string>(user?.color ?? "");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-sync if the store changes (e.g. on first hydration).
  useEffect(() => {
    if (user !== undefined) {
      setName(user.name);
      setColor(user.color);
      setHexInput(user.color);
    }
  }, [user?.name, user?.color]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    if (user === undefined) return false;
    return name.trim() !== user.name || color.toLowerCase() !== user.color.toLowerCase();
  }, [name, color, user]);

  const hexValid = useMemo(() => HEX_RE.test(hexInput), [hexInput]);

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
      const updated = await client.updateParticipant(currentUserId, {
        name: name.trim(),
        color,
      });
      // Update local store with the patched participant.
      const next = { ...participants };
      next[currentUserId] = {
        kind: updated.kind,
        name: updated.name,
        color: updated.color,
      };
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

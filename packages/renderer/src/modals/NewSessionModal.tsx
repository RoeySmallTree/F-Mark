/* NewSessionModal — v0.5 multi-path. Two fields (Folder + Slug). Favorites
   and recent paths surface as clickable presets above the folder field so a
   common folder is a single click. The session is created at the user-chosen
   folder via POST /sessions { slug, path }. */

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { FolderClosed, Star, X } from "lucide-react";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { FolderPicker } from "./newsession/FolderPicker.js";

const SLUG_RE = /^[a-z0-9-]+$/;

function basename(absPath: string): string {
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return trimmed;
  return trimmed.slice(slash + 1) || trimmed;
}

export function NewSessionModal(): JSX.Element {
  const token = useStore((s) => s.token);
  const setSessions = useStore((s) => s.setSessions);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setParticipants = useStore((s) => s.setParticipants);
  const setPathsState = useStore((s) => s.setPathsState);
  const activePath = useStore((s) => s.activePath);
  const knownPaths = useStore((s) => s.knownPaths) ?? [];
  const favorites = useStore((s) => s.favorites) ?? [];
  const closeModal = useStore((s) => s.closeModal);

  const [folder, setFolder] = useState<string | null>(activePath);
  const [slug, setSlug] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugRef = useRef<HTMLInputElement | null>(null);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);

  // Default folder = the active project path. If the renderer has no active
  // path yet, fall back to the kernel-reported home dir.
  useEffect(() => {
    if (folder === null && activePath !== null) setFolder(activePath);
  }, [activePath, folder]);

  useEffect(() => {
    let cancelled = false;
    if (folder !== null) return;
    void (async () => {
      try {
        const h = await client.fsHome();
        if (!cancelled) setFolder(h.home);
      } catch {
        /* leave folder null; submit will surface a clearer error */
      }
    })();
    return () => { cancelled = true; };
  }, [folder, client]);

  const favoritePaths = useMemo(
    () => new Set(favorites.map((f) => f.path)),
    [favorites],
  );
  const recentPresets = useMemo(
    () => knownPaths.filter((p) => !favoritePaths.has(p)),
    [knownPaths, favoritePaths],
  );

  const slugValid = SLUG_RE.test(slug);
  const canSubmit =
    slugValid && folder !== null && folder.length > 0 && !submitting;

  async function onCreate(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await client.createSession({ slug, path: folder! });

      try {
        const paths = await client.getPaths();
        if (Array.isArray(paths.knownPaths) && Array.isArray(paths.favorites)) {
          setPathsState(paths);
        }
      } catch {
        /* legacy kernel without /paths */
      }

      const list = await client.listSessions();
      setSessions(list);
      try {
        setParticipants(await client.listParticipants());
      } catch {
        /* legacy or temporarily unavailable participant route */
      }
      setCurrentSession(session.id);

      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal"
      style={{ width: 560 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-session-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-head">
        <div className="modal-eyebrow">NEW SESSION</div>
        <h2 className="modal-title" id="new-session-title">
          Start a new session
        </h2>
        <button
          type="button"
          className="icon-btn modal-close"
          aria-label="Close"
          onClick={closeModal}
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {pickerOpen ? (
        <div className="modal-body">
          <FolderPicker
            initialPath={folder}
            onPick={(p) => {
              setFolder(p);
              setPickerOpen(false);
            }}
            onCancel={() => setPickerOpen(false)}
          />
        </div>
      ) : (
        <>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-label" style={{ marginBottom: 6 }}>
                FOLDER
              </div>
              {(favorites.length > 0 || recentPresets.length > 0) && (
                <div
                  className="folder-presets"
                  aria-label="Folder presets"
                >
                  {favorites.map((f) => (
                    <button
                      key={`fav-${f.path}`}
                      type="button"
                      className={`folder-preset folder-preset-fav${
                        f.path === folder ? " on" : ""
                      }`}
                      title={f.path}
                      onClick={() => setFolder(f.path)}
                      aria-pressed={f.path === folder}
                    >
                      <Star size={10} aria-hidden />
                      <span className="folder-preset-name">{f.name}</span>
                    </button>
                  ))}
                  {recentPresets.map((p) => (
                    <button
                      key={`recent-${p}`}
                      type="button"
                      className={`folder-preset${p === folder ? " on" : ""}`}
                      title={p}
                      onClick={() => setFolder(p)}
                      aria-pressed={p === folder}
                    >
                      <FolderClosed size={10} aria-hidden />
                      <span className="folder-preset-name">{basename(p)}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="folder-field">
                <FolderClosed size={14} aria-hidden className="folder-field-icon" />
                <span className="folder-field-path" title={folder ?? ""}>
                  {folder ?? "(detecting home…)"}
                </span>
                <button
                  type="button"
                  className="btn-ghost folder-field-browse"
                  onClick={() => setPickerOpen(true)}
                >
                  Browse…
                </button>
              </div>
              <div className="form-hint">
                The session folder is created here as a new subdirectory.
              </div>
            </div>

            <div className="form-row" style={{ marginTop: 18 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>
                NAME
              </div>
              <input
                ref={slugRef}
                className="form-input"
                placeholder="my-session"
                value={slug}
                autoFocus
                aria-label="Session name"
                onChange={(e) => {
                  const raw = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "");
                  setSlug(raw);
                }}
              />
              <div className="form-hint">
                Lowercase letters, digits, hyphens. Used as the session folder
                name.
              </div>
              {slug.length > 0 && !slugValid && (
                <div className="form-error" role="alert">
                  Name must match a–z, 0–9, hyphen.
                </div>
              )}
            </div>

            {error !== null && (
              <div className="form-error" role="alert" style={{ marginTop: 8 }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-foot">
            <div className="foot-actions">
              <button type="button" className="btn-ghost" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-solid"
                disabled={!canSubmit}
                onClick={() => void onCreate()}
              >
                {submitting ? "Creating…" : "Create session"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

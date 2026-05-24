/* NewSessionModal — v0.5 multi-path. Two fields (Folder + Slug) plus the
   keep-open toggle. Template grid and agent-invite sections have been
   removed; the path display in the slug input and modal footer is also
   gone. The session is created at the user-chosen folder via
   POST /sessions { slug, path }. */

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { FolderClosed, X } from "lucide-react";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { FolderPicker } from "./newsession/FolderPicker.js";
import {
  OpenAndCopyToggle,
  orientationSnippet,
} from "./newsession/OpenAndCopyToggle.js";

const SLUG_RE = /^[a-z0-9-]+$/;

export function NewSessionModal(): JSX.Element {
  const token = useStore((s) => s.token);
  const setSessions = useStore((s) => s.setSessions);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const closeModal = useStore((s) => s.closeModal);

  const [folder, setFolder] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openImmediately, setOpenImmediately] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugRef = useRef<HTMLInputElement | null>(null);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);

  // Default folder = the kernel-reported home dir. Future: prefer the
  // renderer-known activePath once it lands in the store.
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

  const slugValid = SLUG_RE.test(slug);
  const canSubmit =
    slugValid && folder !== null && folder.length > 0 && !submitting;

  async function onCreate(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await client.createSession({ slug, path: folder! });

      const list = await client.listSessions();
      setSessions(list);
      setCurrentSession(session.id);

      if (openImmediately) {
        const origin =
          typeof window !== "undefined" && window.location.origin.length > 0
            ? window.location.origin
            : "";
        const snippet = orientationSnippet({
          origin,
          sessionId: session.id,
          token,
        });
        try {
          if (
            typeof navigator !== "undefined" &&
            typeof navigator.clipboard?.writeText === "function"
          ) {
            await navigator.clipboard.writeText(snippet);
          }
        } catch {
          /* clipboard may be unavailable (test env / permissions) */
        }
      }

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

            <div className="form-row" style={{ marginTop: 16 }}>
              <OpenAndCopyToggle
                value={openImmediately}
                onChange={setOpenImmediately}
              />
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

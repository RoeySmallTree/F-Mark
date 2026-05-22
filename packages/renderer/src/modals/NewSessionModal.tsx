/* NewSessionModal — Phase 10.
   Triggered by "+ New" in Sessions panel. On submit:
     1. validate slug (lowercase letters, digits, hyphens; non-empty);
     2. POST /sessions { slug };
     3. if a non-blank template is chosen, post the template's starter as the
        first named-prose event;
     4. for each toggled-on agent we just registered through AgentInvite, the
        registration call already fired — nothing to do here;
     5. refresh /sessions + setCurrentSession to the new id;
     6. if "open immediately + copy snippet" is on, write the orientation
        snippet to navigator.clipboard;
     7. close the modal.

   Structure mirrors planning/redesign/modals.jsx NewSessionModal. */

import { useMemo, useRef, useState, type JSX } from "react";
import { X } from "lucide-react";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";
import { SlugInput, todayDatePrefix } from "./newsession/SlugInput.js";
import { TemplateGrid } from "./newsession/TemplateGrid.js";
import { AgentInvite } from "./newsession/AgentInvite.js";
import {
  OpenAndCopyToggle,
  orientationSnippet,
} from "./newsession/OpenAndCopyToggle.js";
import { templateByKey, type TemplateKey } from "./newsession/templates.js";

const SLUG_RE = /^[a-z0-9-]+$/;

export function NewSessionModal(): JSX.Element {
  const token = useStore((s) => s.token);
  const userId = useStore((s) => s.currentUserId);
  const participants = useStore((s) => s.participants);
  const setSessions = useStore((s) => s.setSessions);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const closeModal = useStore((s) => s.closeModal);

  const [slug, setSlug] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("blank");
  const [openImmediately, setOpenImmediately] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugRef = useRef<HTMLInputElement | null>(null);

  const datePrefix = useMemo(() => todayDatePrefix(), []);

  const slugValid = SLUG_RE.test(slug);
  const canSubmit = slugValid && !submitting;

  function toggleAgent(id: string): void {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onCreate(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const session = await client.createSession({ slug });

      // Optionally post the starter contribution.
      const tpl = templateByKey(template);
      if (tpl.starter !== null && userId !== null) {
        await client.postProse(session.id, {
          participant_id: userId,
          content: tpl.starter.body,
          name: tpl.starter.name,
        });
      }

      // Refresh sessions list + switch into the new session.
      const list = await client.listSessions();
      setSessions(list);
      setCurrentSession(session.id);

      // Optional clipboard copy.
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
          // Non-fatal — clipboard may be unavailable (test env / permissions).
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

      <div className="modal-body">
        <div className="form-row">
          <div className="form-label" style={{ marginBottom: 6 }}>
            SLUG
          </div>
          <SlugInput
            value={slug}
            onChange={setSlug}
            datePrefix={datePrefix}
            autoFocus
            inputRef={slugRef}
          />
          <div className="form-hint">
            Used as the folder name and CLI argument. Lowercase letters,
            digits, hyphens.
          </div>
          {slug.length > 0 && !slugValid && (
            <div className="form-error" role="alert">
              Slug must match a–z, 0–9, hyphen.
            </div>
          )}
        </div>

        <div className="form-row" style={{ marginTop: 18 }}>
          <div className="form-label" style={{ marginBottom: 8 }}>
            TEMPLATE
          </div>
          <TemplateGrid value={template} onChange={setTemplate} />
        </div>

        <div className="form-row" style={{ marginTop: 18 }}>
          <div className="form-label" style={{ marginBottom: 8 }}>
            INVITE
          </div>
          <AgentInvite
            participants={participants}
            selected={selectedAgents}
            onToggle={toggleAgent}
          />
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
        <div className="hint">
          Path: <code>.f-mark/sessions/{datePrefix}-{slug.length > 0 ? slug : "<slug>"}/</code>
        </div>
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
    </div>
  );
}

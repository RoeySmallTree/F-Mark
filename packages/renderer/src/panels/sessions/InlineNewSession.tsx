import { useState, type JSX } from "react";
import { Plus } from "lucide-react";
import { PLACEHOLDER_SESSION_SLUG } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import type { SessionMeta } from "../../api/client.js";
import { basename } from "./model.js";

const INLINE_NEW_SESSION_LABELS = {
  creating: "Creating…",
  newSession: "New session",
} as const;

interface InlineNewSessionProps {
  path: string;
  onCreated: (session: SessionMeta) => void;
  token: string | null;
  iconOnly?: boolean;
}

/* One-click creation: sessions open immediately with the placeholder slug
   (`new-session`); the connected agent renames it via `fmark_rename_session`
   once it knows what the session is about. */
export function InlineNewSession(props: InlineNewSessionProps): JSX.Element {
  const { path, onCreated, token, iconOnly = false } = props;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const session = await client.createSession({
        slug: PLACEHOLDER_SESSION_SLUG,
        path,
      });
      onCreated(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <span
      className={`inline-new-session-root${iconOnly ? " is-icon-only" : ""}`}
    >
      <button
        type="button"
        className={`inline-new-session${iconOnly ? " is-icon-only" : ""}`}
        disabled={submitting}
        onClick={(event) => {
          if (iconOnly) {
            event.preventDefault();
            event.stopPropagation();
          }
          void create();
        }}
        onKeyDown={(event) => {
          if (iconOnly) event.stopPropagation();
        }}
        aria-label={`New session in ${basename(path)}`}
        aria-busy={submitting}
        title={`New session in ${basename(path)}`}
      >
        <Plus
          size={13}
          strokeWidth={1.5}
          aria-hidden="true"
          className="inline-new-session-icon"
        />
        {iconOnly ? null : (
          <span>
            {submitting
              ? INLINE_NEW_SESSION_LABELS.creating
              : INLINE_NEW_SESSION_LABELS.newSession}
          </span>
        )}
      </button>
      {error !== null ? (
        <span className="inline-new-session-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

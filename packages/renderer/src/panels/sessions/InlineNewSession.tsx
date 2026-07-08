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
}

/* One-click creation: sessions open immediately with the placeholder slug
   (`new-session`); the connected agent renames it via `fmark_rename_session`
   once it knows what the session is about. */
export function InlineNewSession(props: InlineNewSessionProps): JSX.Element {
  const { path, onCreated, token } = props;
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
    <div className="inline-new-session-root">
      <button
        type="button"
        className="inline-new-session"
        disabled={submitting}
        onClick={() => void create()}
        aria-label={`New session in ${basename(path)}`}
      >
        <Plus
          size={12}
          aria-hidden="true"
          className="inline-new-session-icon"
        />
        <span>
          {submitting
            ? INLINE_NEW_SESSION_LABELS.creating
            : INLINE_NEW_SESSION_LABELS.newSession}
        </span>
      </button>
      {error !== null ? (
        <div className="inline-new-session-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

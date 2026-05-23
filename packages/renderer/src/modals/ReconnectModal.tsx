/* ReconnectModal — Phase 12.
   Opens when the user wants to walk an offline agent back into a session.
   Fetches `/guide?agent_id=…&session_id=…&runtime_id=…` (text/markdown),
   renders the body, and exposes a Copy button so the user can paste the
   whole snippet into the offline CLI.

   The kernel's guide route already substitutes the right base URL, token
   placeholders, and per-runtime hook hints, so this modal is essentially
   a viewer + clipboard helper. */

import { useEffect, useMemo, useState, type JSX } from "react";
import { X } from "lucide-react";
import { MarkdownRenderer } from "../render/MarkdownRenderer.js";
import { copyToClipboard } from "../render/copy.js";

export interface ReconnectModalProps {
  participantId: string;
  sessionId: string;
  runtimeId: string;
  baseUrl: string;
  token: string | null;
  onClose(): void;
}

function buildGuideUrl(
  baseUrl: string,
  participantId: string,
  sessionId: string,
  runtimeId: string,
): string {
  const q = new URLSearchParams();
  q.set("agent_id", participantId);
  q.set("session_id", sessionId);
  q.set("runtime_id", runtimeId);
  return `${baseUrl}/guide?${q.toString()}`;
}

export function ReconnectModal({
  participantId,
  sessionId,
  runtimeId,
  baseUrl,
  token,
  onClose,
}: ReconnectModalProps): JSX.Element {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = useMemo(
    () => buildGuideUrl(baseUrl, participantId, sessionId, runtimeId),
    [baseUrl, participantId, sessionId, runtimeId],
  );

  useEffect(() => {
    let alive = true;
    setMarkdown(null);
    setError(null);
    const headers: Record<string, string> = {};
    if (token !== null && token.length > 0) {
      headers.Authorization = `Bearer ${token}`;
    }
    fetch(url, { headers })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load /guide (HTTP ${res.status})`);
        }
        const body = await res.text();
        if (alive) setMarkdown(body);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [url, token]);

  async function onCopy(): Promise<void> {
    if (markdown === null) return;
    const ok = await copyToClipboard(markdown);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-modal="reconnect"
    >
      <div
        className="modal reconnect-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconnect-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-eyebrow">RECONNECT</div>
          <h2 className="modal-title" id="reconnect-title">
            Walk this agent back online
          </h2>
          <button
            type="button"
            className="icon-btn modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          {error !== null ? (
            <div role="alert" className="form-error">
              {error}
            </div>
          ) : markdown === null ? (
            <div className="form-hint">Loading reconnect guide…</div>
          ) : (
            <div className="install-instructions">
              <MarkdownRenderer content={markdown} />
            </div>
          )}
        </div>
        <div className="modal-foot">
          <div className="hint">
            Participant: <code>{participantId}</code> · Runtime:{" "}
            <code>{runtimeId}</code>
          </div>
          <div className="foot-actions">
            <button
              type="button"
              className={`btn-ghost${copied ? " copied" : ""}`}
              disabled={markdown === null}
              onClick={() => {
                void onCopy();
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="btn-solid" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

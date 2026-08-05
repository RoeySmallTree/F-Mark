/* TerminalOverlay — a standalone modal that hosts a single live terminal for a
   tmux session. Used by the agent "open terminal" affordance to peek at an
   agent's pane. Standalone terminals live in the Terminal dock tab instead.

   The xterm/WebSocket machinery lives in the shared <TerminalView> so the modal
   and the dock tab render terminals identically. This component only provides
   the modal chrome (backdrop, header, Detach/close). Mounted = active WS;
   unmount (Detach / backdrop click → onClose) tears it down. */

import { useRef, type JSX } from "react";
import { X } from "lucide-react";
import { TerminalView } from "../components/terminalView/TerminalView.js";
import { useFocusTrap } from "../a11y/useFocusTrap.js";

export interface TerminalOverlayProps {
  /** Tmux session id this overlay attaches to (e.g. "fmark-ag-c92e"). */
  tmuxSession: string;
  /** Bearer token; appended as `?token=` query param when set. */
  token: string | null;
  /** Base origin to derive the ws URL from (e.g. window.location.origin). */
  baseUrl: string;
  onClose(): void;
}

export function TerminalOverlay({
  tmuxSession,
  token,
  baseUrl,
  onClose,
}: TerminalOverlayProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-modal="terminal"
    >
      <div
        ref={dialogRef}
        className="modal terminal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`Terminal — ${tmuxSession}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head terminal-overlay-head">
          <div className="modal-eyebrow">TMUX SESSION</div>
          <h2 className="modal-title" style={{ fontSize: 16 }}>
            {tmuxSession}
          </h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            style={{ position: "absolute", right: 12, top: 12 }}
          >
            Detach
          </button>
          <button
            type="button"
            className="icon-btn modal-close"
            aria-label="Close"
            onClick={onClose}
            style={{ right: 78 }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="terminal-overlay-body">
          <TerminalView
            tmuxSession={tmuxSession}
            token={token}
            baseUrl={baseUrl}
            active
          />
        </div>
      </div>
    </div>
  );
}

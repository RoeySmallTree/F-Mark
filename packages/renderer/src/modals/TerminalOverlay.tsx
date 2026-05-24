/* TerminalOverlay — Phase 12.
   A standalone modal that attaches an xterm.js Terminal to the kernel's
   /ws/pane channel for a single tmux session. Unlike the other modals
   (NewSession, Settings, CmdK, etc.) this one is *not* dispatched through
   ModalRoot — callers (the SessionTabs / TmuxSwitcher chip, etc.) mount it
   directly with explicit props because the lifetime is tied to a specific
   tmux session id, not to a generic activeModal slot.

   Mounted overlay = active WS. Unmount = close WS + dispose Terminal.
   Detach button (and backdrop click) calls onClose so the parent can
   unmount us. The Terminal is autofocus-friendly — once xterm.open()
   completes, the underlying textarea takes keystrokes automatically.

   The bridge (lib/xtermBridge.ts) is pure logic and unit-tested separately.
   Here we just provide it with a `PaneSocketLike` adapter wrapping the
   live WebSocket. */

import { useEffect, useRef, type JSX } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { X } from "lucide-react";
import {
  createXtermBridge,
  type PaneSocketLike,
} from "../lib/xtermBridge.js";

export interface TerminalOverlayProps {
  /** Tmux session id this overlay attaches to (e.g. "fmark-ag-c92e"). */
  tmuxSession: string;
  /** Bearer token; appended as `?token=` query param when set. */
  token: string | null;
  /** Base origin to derive the ws URL from (e.g. window.location.origin). */
  baseUrl: string;
  onClose(): void;
}

function buildWsUrl(
  baseUrl: string,
  tmuxSession: string,
  token: string | null,
  cols?: number,
  rows?: number,
): string {
  const wsBase = baseUrl.replace(/^http/, "ws");
  const params = new URLSearchParams();
  params.set("session", tmuxSession);
  if (cols !== undefined && rows !== undefined) {
    params.set("cols", String(cols));
    params.set("rows", String(rows));
  }
  if (token !== null && token.length > 0) params.set("token", token);
  return `${wsBase}/ws/pane?${params.toString()}`;
}

export function TerminalOverlay({
  tmuxSession,
  token,
  baseUrl,
  onClose,
}: TerminalOverlayProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current === null) return;
    const term = new Terminal({ convertEol: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      /* swallow — fit can throw if container is not yet measured */
    }

    const listeners: ((msg: unknown) => void)[] = [];
    const ws = new WebSocket(
      buildWsUrl(baseUrl, tmuxSession, token, term.cols, term.rows),
    );
    const socket: PaneSocketLike = {
      send(data) {
        // WebSocket.OPEN === 1. In jsdom tests the mock exposes the static
        // but doesn't import it as a constant here, so compare literally.
        if (ws.readyState === 1) ws.send(data);
      },
      addMessageListener(cb) {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      close() {
        ws.close();
      },
    };
    ws.onmessage = (e) => {
      let msg: unknown;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      for (const l of listeners.slice()) l(msg);
    };

    const bridge = createXtermBridge(socket);
    bridge.attach(term);
    /* Initial resize over the WS. The dimensions also go into the connection
       URL so the kernel can resize tmux before capture-pane snapshots. */
    bridge.resize(term.cols, term.rows);

    return () => {
      bridge.detach();
      ws.close();
      term.dispose();
    };
  }, [tmuxSession, baseUrl, token]);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-modal="terminal"
    >
      <div
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
        <div
          ref={containerRef}
          className="terminal-overlay-body"
          data-testid="terminal-host"
        />
      </div>
    </div>
  );
}

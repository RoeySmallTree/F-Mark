const NO_LOOSE_STRING_VALUES = {
  ws: "ws",
} as const;

/* TerminalView — the reusable xterm.js ↔ /ws/pane surface.
   Extracted from the original TerminalOverlay so both the modal overlay and the
   Terminal dock tab share ONE rendering implementation (xterm + FitAddon + the
   live WebSocket + xtermBridge). The bridge (lib/xtermBridge.ts) is pure logic,
   unit-tested separately; here we only adapt it to a live WebSocket.

   Lifecycle contract:
   - Connects on MOUNT. The Terminal tab mounts a view only when its terminal is
     first activated, so on mount the host is visible and the initial FitAddon
     measurement is valid (a `display:none` host would measure 0×0 and push a
     garbage size to the single tmux pane — /ws/pane only validates the initial
     query size, not later pane.resize messages).
   - `active` drives RE-FIT, not connection: when a view is re-shown after being
     hidden behind another tab, and on container resize, we re-fit — but only
     while `active` and the host has non-zero size. Resize sends are throttled
     with requestAnimationFrame and deduped on (cols, rows).
   - Disposes on UNMOUNT (bridge detach + ws close + term dispose). Inactive
     views stay mounted (hidden via the parent's `visibility`), so re-selecting
     a tab is instant and preserves scrollback + the live connection. */

import { useCallback, useEffect, useRef, type JSX } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
// xterm's stylesheet. Imported here (not globally) so it stays code-split with
// the lazy chunk that pulls in xterm.
import "@xterm/xterm/css/xterm.css";
import { createXtermBridge, type PaneSocketLike } from "../../lib/xtermBridge.js";

export interface TerminalViewProps {
  /** Tmux session id this view attaches to (e.g. "fmark-…-term-1"). */
  tmuxSession: string;
  /** Bearer token; appended as `?token=` query param when set. */
  token: string | null;
  /** Base origin to derive the ws URL from (empty string = same origin). */
  baseUrl: string;
  /** Whether this view is the visible one (drives re-fit + resize gating). */
  active: boolean;
}

interface LiveTerminal {
  term: Terminal;
  fit: FitAddon;
  ws: WebSocket;
  bridge: ReturnType<typeof createXtermBridge>;
}

export function buildPaneWsUrl(
  baseUrl: string,
  tmuxSession: string,
  token: string | null,
  cols?: number,
  rows?: number,
): string {
  const wsBase = baseUrl.replace(/^http/, NO_LOOSE_STRING_VALUES.ws);
  const params = new URLSearchParams();
  params.set("session", tmuxSession);
  if (cols !== undefined && rows !== undefined) {
    params.set("cols", String(cols));
    params.set("rows", String(rows));
  }
  if (token !== null && token.length > 0) params.set("token", token);
  return `${wsBase}/ws/pane?${params.toString()}`;
}

function createPaneSocket(ws: WebSocket): PaneSocketLike {
  const listeners: ((msg: unknown) => void)[] = [];
  ws.onmessage = (e) => {
    let msg: unknown;
    try {
      msg = JSON.parse(e.data as string);
    } catch {
      return;
    }
    for (const l of listeners.slice()) l(msg);
  };
  return {
    send(data) {
      // WebSocket.OPEN === 1. jsdom mocks expose the static but not as a
      // constant here, so compare literally.
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
}

function safeFit(fit: FitAddon): void {
  try {
    fit.fit();
  } catch {
    /* fit throws if the container is not yet measured — ignore. */
  }
}

export function TerminalView({
  tmuxSession,
  token,
  baseUrl,
  active,
}: TerminalViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<LiveTerminal | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });

  /* Re-fit the xterm to the host and tell the kernel — but only when the host
     is visibly sized, and only emit pane.resize when the size actually changed. */
  const fitAndSync = useCallback((): void => {
    const live = liveRef.current;
    const container = containerRef.current;
    if (live === null || container === null) return;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    safeFit(live.fit);
    const { cols, rows } = live.term;
    if (cols === lastSizeRef.current.cols && rows === lastSizeRef.current.rows) {
      return;
    }
    lastSizeRef.current = { cols, rows };
    live.bridge.resize(cols, rows);
  }, []);

  // Connect on mount; dispose on unmount.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const term = new Terminal({ convertEol: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    safeFit(fit);

    const ws = new WebSocket(
      buildPaneWsUrl(baseUrl, tmuxSession, token, term.cols, term.rows),
    );
    const bridge = createXtermBridge(createPaneSocket(ws));
    bridge.attach(term);
    bridge.resize(term.cols, term.rows);
    lastSizeRef.current = { cols: term.cols, rows: term.rows };
    liveRef.current = { term, fit, ws, bridge };

    return () => {
      bridge.detach();
      ws.close();
      term.dispose();
      liveRef.current = null;
    };
  }, [tmuxSession, token, baseUrl]);

  // Re-fit when this view becomes the active (visible) one again.
  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(fitAndSync);
    return () => cancelAnimationFrame(raf);
  }, [active, fitAndSync]);

  // Re-fit on container resize, rAF-throttled, only while active.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (active) fitAndSync();
      });
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [active, fitAndSync]);

  return (
    <div ref={containerRef} className="terminal-view-host" data-testid="terminal-host" />
  );
}

/* xtermBridge — Phase 12.
   Pure logic: glue xterm.js Terminal output ↔ the kernel's /ws/pane channel
   protocol without touching DOM or WebSocket APIs directly. The TerminalOverlay
   modal wires this up against the live WebSocket; tests can inject a fake
   socket and a fake Terminal.

   /ws/pane protocol (see packages/kernel/src/ws/pane.ts):
     Server → client
       { type: "pane.snapshot", data: <history string> }       — initial
       { type: "pane.data",     data: <chunk string> }         — live chunks
       { type: "pane.error",    error: <reason string> }       — failures
     Client → server
       { type: "pane.input",  data: <text> }                   — literal text
       { type: "pane.key",    key: <named key> }               — tmux-style key
       { type: "pane.resize", cols, rows }                     — terminal size

   Special keys (Enter, Ctrl-C, Ctrl-D, arrows) are translated to named
   pane.key events instead of sending the raw escape sequences as text —
   tmux's `send-keys` understands the named form and routes them correctly
   to the inner CLI runtime.
*/

import type { Terminal } from "@xterm/xterm";

export interface PaneSocketLike {
  send(data: string): void;
  /** Returns an unsubscribe function. */
  addMessageListener(cb: (msg: unknown) => void): () => void;
  close(): void;
}

export interface XtermBridge {
  attach(term: Terminal): void;
  detach(): void;
  resize(cols: number, rows: number): void;
}

interface IncomingSnapshot {
  type: "pane.snapshot";
  data: string;
}
interface IncomingData {
  type: "pane.data";
  data: string;
}
interface IncomingError {
  type: "pane.error";
  error: string;
}

function isPaneMessage(
  msg: unknown,
): msg is IncomingSnapshot | IncomingData | IncomingError {
  if (msg === null || typeof msg !== "object") return false;
  const m = msg as { type?: unknown };
  return (
    m.type === "pane.snapshot" ||
    m.type === "pane.data" ||
    m.type === "pane.error"
  );
}

export function createXtermBridge(socket: PaneSocketLike): XtermBridge {
  let term: Terminal | null = null;
  let unsub: (() => void) | null = null;
  let onDataSub: { dispose(): void } | null = null;

  function translate(d: string): string {
    if (d === "\r") {
      return JSON.stringify({ type: "pane.key", key: "C-m" });
    }
    if (d === "") {
      return JSON.stringify({ type: "pane.key", key: "C-c" });
    }
    if (d === "") {
      return JSON.stringify({ type: "pane.key", key: "C-d" });
    }
    if (d === "[A") {
      return JSON.stringify({ type: "pane.key", key: "Up" });
    }
    if (d === "[B") {
      return JSON.stringify({ type: "pane.key", key: "Down" });
    }
    if (d === "[C") {
      return JSON.stringify({ type: "pane.key", key: "Right" });
    }
    if (d === "[D") {
      return JSON.stringify({ type: "pane.key", key: "Left" });
    }
    return JSON.stringify({ type: "pane.input", data: d });
  }

  return {
    attach(t) {
      term = t;
      unsub = socket.addMessageListener((msg) => {
        const cur = term;
        if (cur === null) return;
        if (!isPaneMessage(msg)) return;
        if (msg.type === "pane.snapshot" && typeof msg.data === "string") {
          const resettable = cur as unknown as { reset?: () => void };
          resettable.reset?.();
          cur.write(msg.data);
        } else if (msg.type === "pane.data" && typeof msg.data === "string") {
          cur.write(msg.data);
        } else if (msg.type === "pane.error") {
          cur.write(`\r\n[error] ${msg.error}\r\n`);
        }
      });
      onDataSub = t.onData((d: string) => {
        socket.send(translate(d));
      });
    },
    detach() {
      if (onDataSub !== null) {
        onDataSub.dispose();
        onDataSub = null;
      }
      if (unsub !== null) {
        unsub();
        unsub = null;
      }
      term = null;
    },
    resize(cols, rows) {
      socket.send(JSON.stringify({ type: "pane.resize", cols, rows }));
    },
  };
}

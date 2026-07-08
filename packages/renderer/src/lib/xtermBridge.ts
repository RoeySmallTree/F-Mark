const NO_LOOSE_STRING_VALUES = {
  bspace: "BSpace",
  cM: "C-m",
} as const;

/* xtermBridge.
   Pure logic: glue xterm.js Terminal output ↔ the kernel's /ws/pane channel
   protocol without touching DOM or WebSocket APIs directly. TerminalView wires
   this up against the live WebSocket; tests can inject a fake socket and a fake
   Terminal.

   /ws/pane protocol (see packages/kernel/src/ws/pane.ts):
     Server → client
       { type: "pane.snapshot", data: <history string> }       — initial
       { type: "pane.data",     data: <chunk string> }         — live chunks
       { type: "pane.error",    error: <reason string> }       — failures
     Client → server
       { type: "pane.input",  data: <text> }                   — literal text
       { type: "pane.key",    key: <named key> }               — tmux-style key
       { type: "pane.resize", cols, rows }                     — terminal size

   Control keys (Enter, Backspace, Escape, every Ctrl-<letter>, arrows, and the
   nav cluster) are translated to named pane.key events instead of being sent as
   literal text. This is REQUIRED, not just tidy: the kernel's pane.input
   validator rejects any C0 control byte except Tab (see
   runtimes/validation/scalars.ts), so an un-translated Backspace (0x7f) would
   come back as "message contains control char". tmux `send-keys` understands
   the named form and routes it to the inner CLI runtime.
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

/* Multi-byte sequences xterm emits for the nav cluster → tmux send-keys names.
   Both the normal (CSI `\x1b[`) and application-cursor (SS3 `\x1bO`) forms are
   covered because xterm switches between them depending on terminal mode. */
const ESC_SEQ_KEYS: Record<string, string> = {
  "\x1b[A": "Up",
  "\x1bOA": "Up",
  "\x1b[B": "Down",
  "\x1bOB": "Down",
  "\x1b[C": "Right",
  "\x1bOC": "Right",
  "\x1b[D": "Left",
  "\x1bOD": "Left",
  "\x1b[H": "Home",
  "\x1bOH": "Home",
  "\x1b[1~": "Home",
  "\x1b[F": "End",
  "\x1bOF": "End",
  "\x1b[4~": "End",
  "\x1b[3~": "DC",
  "\x1b[5~": "PPage",
  "\x1b[6~": "NPage",
  "\x1b[Z": "BTab",
};

/**
 * Translate a chunk from xterm's `onData` into a named tmux key, or null when it
 * should be sent as literal text. Exported for direct unit testing.
 */
export function paneKeyFor(
  d: string,
): { type: "pane.key"; key: string } | null {
  const seqKey = ESC_SEQ_KEYS[d];
  if (seqKey !== undefined) return { type: "pane.key", key: seqKey };

  if (d.length !== 1) return null;
  const code = d.charCodeAt(0);

  // Backspace: xterm sends DEL (0x7f); some configs send BS (0x08).
  if (code === 0x7f || code === 0x08) {
    return { type: "pane.key", key: NO_LOOSE_STRING_VALUES.bspace };
  }
  // Standalone Escape.
  if (code === 0x1b) return { type: "pane.key", key: "Escape" };
  // Enter.
  if (code === 0x0d) return { type: "pane.key", key: NO_LOOSE_STRING_VALUES.cM };
  // Tab (0x09) is the one control byte the validator allows as literal input.
  if (code === 0x09) return null;
  // Any other C0 control char in the letter range → Ctrl-<letter>
  // (0x01 → C-a … 0x1a → C-z), which send-keys understands and the literal
  // validator forbids.
  if (code >= 0x01 && code <= 0x1a) {
    return { type: "pane.key", key: `C-${String.fromCharCode(code + 0x60)}` };
  }
  return null;
}

const TEXT_FLUSH_DELAY_MS = 8;

export function createXtermBridge(socket: PaneSocketLike): XtermBridge {
  let term: Terminal | null = null;
  let unsub: (() => void) | null = null;
  let onDataSub: { dispose(): void } | null = null;
  let pendingText = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function clearFlushTimer(): void {
    if (flushTimer === null) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  function flushText(): void {
    clearFlushTimer();
    if (pendingText.length === 0) return;
    const data = pendingText;
    pendingText = "";
    socket.send(JSON.stringify({ type: "pane.input", data }));
  }

  function queueText(d: string): void {
    pendingText += d;
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flushText, TEXT_FLUSH_DELAY_MS);
  }

  function sendTerminalInput(d: string): void {
    const special = paneKeyFor(d);
    if (special !== null) {
      flushText();
      socket.send(JSON.stringify(special));
      return;
    }
    queueText(d);
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
        sendTerminalInput(d);
      });
    },
    detach() {
      flushText();
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

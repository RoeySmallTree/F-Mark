/* Phase 12 — xtermBridge unit tests.
   The bridge ties xterm.js Terminal output ↔ /ws/pane WebSocket without
   pulling in DOM or WebSocket directly. We exercise it with a fake socket
   that records sent JSON and a fake Terminal that records write() calls
   and exposes a `simulateTyping` helper to drive `onData`. */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createXtermBridge,
  paneKeyFor,
  type PaneSocketLike,
} from "../../src/lib/xtermBridge.js";

describe("paneKeyFor — control keys map to named tmux keys (not literal text)", () => {
  const key = (k: string) => ({ type: "pane.key", key: k });
  const ch = (code: number) => String.fromCharCode(code);

  it("Backspace (DEL 0x7f and BS 0x08) → BSpace", () => {
    // Regression: an un-translated 0x7f reaches pane.input and the kernel
    // rejects it as "message contains control char at index 0".
    expect(paneKeyFor(ch(0x7f))).toEqual(key("BSpace"));
    expect(paneKeyFor(ch(0x08))).toEqual(key("BSpace"));
  });

  it("standalone Escape (0x1b) → Escape", () => {
    expect(paneKeyFor(ch(0x1b))).toEqual(key("Escape"));
  });

  it("Enter (0x0d) → C-m", () => {
    expect(paneKeyFor(ch(0x0d))).toEqual(key("C-m"));
  });

  it("Tab (0x09) stays literal text (the one allowed control byte)", () => {
    expect(paneKeyFor(ch(0x09))).toBeNull();
  });

  it("every Ctrl-<letter> → C-<letter> (0x01→C-a … 0x1a→C-z)", () => {
    expect(paneKeyFor(ch(0x01))).toEqual(key("C-a"));
    expect(paneKeyFor(ch(0x03))).toEqual(key("C-c"));
    expect(paneKeyFor(ch(0x15))).toEqual(key("C-u")); // line-kill
    expect(paneKeyFor(ch(0x17))).toEqual(key("C-w")); // word-erase
    expect(paneKeyFor(ch(0x1a))).toEqual(key("C-z"));
  });

  it("nav cluster escape sequences → named keys", () => {
    expect(paneKeyFor("\x1b[A")).toEqual(key("Up"));
    expect(paneKeyFor("\x1bOA")).toEqual(key("Up")); // application-cursor form
    expect(paneKeyFor("\x1b[3~")).toEqual(key("DC")); // Delete
    expect(paneKeyFor("\x1b[H")).toEqual(key("Home"));
    expect(paneKeyFor("\x1b[F")).toEqual(key("End"));
    expect(paneKeyFor("\x1b[5~")).toEqual(key("PPage"));
    expect(paneKeyFor("\x1b[6~")).toEqual(key("NPage"));
    expect(paneKeyFor("\x1b[Z")).toEqual(key("BTab"));
  });

  it("printable text returns null (sent as literal input)", () => {
    expect(paneKeyFor("a")).toBeNull();
    expect(paneKeyFor("hello")).toBeNull();
    expect(paneKeyFor(" ")).toBeNull();
  });
});

interface RecordingSocket extends PaneSocketLike {
  sent: string[];
  emit(msg: unknown): void;
}

function fakeSocket(): RecordingSocket {
  const sent: string[] = [];
  const listeners: ((msg: unknown) => void)[] = [];
  const sock: RecordingSocket = {
    sent,
    send(data) {
      sent.push(data);
    },
    addMessageListener(cb) {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    close() {
      /* noop */
    },
    emit(msg) {
      for (const l of listeners.slice()) l(msg);
    },
  };
  return sock;
}

interface FakeTerm {
  writes: string[];
  write(s: string): void;
  onData(cb: (d: string) => void): { dispose(): void };
  simulateTyping(s: string): void;
  cols: number;
  rows: number;
  disposed: boolean;
}

function fakeTerm(): FakeTerm {
  const writes: string[] = [];
  let dataCb: ((d: string) => void) | null = null;
  return {
    writes,
    cols: 80,
    rows: 24,
    disposed: false,
    write(s) {
      writes.push(s);
    },
    onData(cb) {
      dataCb = cb;
      return {
        dispose: () => {
          dataCb = null;
        },
      };
    },
    simulateTyping(s) {
      if (dataCb !== null) dataCb(s);
    },
  };
}

describe("xtermBridge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes pane.snapshot data into the terminal", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    sock.emit({ type: "pane.snapshot", data: "hello world" });
    expect(term.writes).toContain("hello world");
  });

  it("writes successive pane.data chunks in order", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    sock.emit({ type: "pane.data", data: "chunk1" });
    sock.emit({ type: "pane.data", data: "chunk2" });
    expect(term.writes).toEqual(["chunk1", "chunk2"]);
  });

  it("writes pane.error with a leading [error] tag", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    sock.emit({ type: "pane.error", error: "session not found" });
    expect(term.writes.some((s) => s.includes("[error] session not found")))
      .toBe(true);
  });

  it("ignores messages with unrecognized types", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    sock.emit({ type: "garbage", data: "x" });
    expect(term.writes).toEqual([]);
  });

  it("sends Enter (\\r) as a pane.key C-m, not as input text", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    term.simulateTyping("\r");
    expect(sock.sent).toEqual([
      JSON.stringify({ type: "pane.key", key: "C-m" }),
    ]);
  });

  it("flushes pending text before sending Enter", () => {
    vi.useFakeTimers();
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    term.simulateTyping("git status");
    term.simulateTyping("\r");
    expect(sock.sent).toEqual([
      JSON.stringify({ type: "pane.input", data: "git status" }),
      JSON.stringify({ type: "pane.key", key: "C-m" }),
    ]);
  });

  it("sends Ctrl-C (\\u0003) as pane.key C-c", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    term.simulateTyping("");
    expect(sock.sent).toContain(JSON.stringify({ type: "pane.key", key: "C-c" }));
  });

  it("sends Ctrl-D (\\u0004) as pane.key C-d", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    term.simulateTyping("");
    expect(sock.sent).toContain(JSON.stringify({ type: "pane.key", key: "C-d" }));
  });

  it("sends arrow keys as named pane.key events", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    term.simulateTyping("[A");
    term.simulateTyping("[B");
    term.simulateTyping("[C");
    term.simulateTyping("[D");
    expect(sock.sent).toEqual([
      JSON.stringify({ type: "pane.key", key: "Up" }),
      JSON.stringify({ type: "pane.key", key: "Down" }),
      JSON.stringify({ type: "pane.key", key: "Right" }),
      JSON.stringify({ type: "pane.key", key: "Left" }),
    ]);
  });

  it("coalesces rapid arbitrary text into one pane.input", () => {
    vi.useFakeTimers();
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    term.simulateTyping("h");
    term.simulateTyping("e");
    term.simulateTyping("l");
    term.simulateTyping("l");
    term.simulateTyping("o");
    expect(sock.sent).toEqual([]);
    vi.runOnlyPendingTimers();
    expect(sock.sent).toEqual([
      JSON.stringify({ type: "pane.input", data: "hello" }),
    ]);
  });

  it("detach() flushes pending text before disposing the data subscription", () => {
    vi.useFakeTimers();
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    term.simulateTyping("pending");
    bridge.detach();
    expect(sock.sent).toEqual([
      JSON.stringify({ type: "pane.input", data: "pending" }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resize() sends pane.resize with cols/rows", () => {
    const sock = fakeSocket();
    const bridge = createXtermBridge(sock);
    bridge.resize(120, 30);
    expect(sock.sent).toEqual([
      JSON.stringify({ type: "pane.resize", cols: 120, rows: 30 }),
    ]);
  });

  it("detach() removes listeners — incoming messages no longer write", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    sock.emit({ type: "pane.data", data: "before" });
    bridge.detach();
    sock.emit({ type: "pane.data", data: "after" });
    expect(term.writes).toEqual(["before"]);
  });

  it("detach() disposes the terminal onData subscription so typing no longer sends", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    bridge.detach();
    term.simulateTyping("after-detach");
    expect(sock.sent).toEqual([]);
  });
});

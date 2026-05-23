/* Phase 12 — xtermBridge unit tests.
   The bridge ties xterm.js Terminal output ↔ /ws/pane WebSocket without
   pulling in DOM or WebSocket directly. We exercise it with a fake socket
   that records sent JSON and a fake Terminal that records write() calls
   and exposes a `simulateTyping` helper to drive `onData`. */

import { describe, expect, it } from "vitest";
import {
  createXtermBridge,
  type PaneSocketLike,
} from "../../src/lib/xtermBridge.js";

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

  it("sends arbitrary text via pane.input", () => {
    const sock = fakeSocket();
    const term = fakeTerm();
    const bridge = createXtermBridge(sock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bridge.attach(term as any);
    term.simulateTyping("hello");
    expect(sock.sent).toContain(
      JSON.stringify({ type: "pane.input", data: "hello" }),
    );
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

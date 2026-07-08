import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { connectWs } from "../../src/api/ws.js";

type Listener = (event: { data?: string }) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly listeners = new Map<string, Listener[]>();
  closed = false;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  close(): void {
    this.closed = true;
    this.emit("close");
  }

  emit(type: string, event: { data?: string } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe("connectWs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("reconnects after close and marks the next open as reconnected", async () => {
    const openStates: boolean[] = [];
    const messages: unknown[] = [];
    const connection = connectWs(
      { baseUrl: "http://kernel.example", token: "secret" },
      (message) => messages.push(message),
      (event) => openStates.push(event.reconnected),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances[0]?.url).toBe(
      "ws://kernel.example/ws?token=secret",
    );
    MockWebSocket.instances[0]!.emit("open");
    MockWebSocket.instances[0]!.emit("message", {
      data: JSON.stringify({ type: "paths-updated" }),
    });
    MockWebSocket.instances[0]!.emit("close");

    await vi.advanceTimersByTimeAsync(500);

    expect(MockWebSocket.instances).toHaveLength(2);
    MockWebSocket.instances[1]!.emit("open");
    expect(openStates).toEqual([false, true]);
    expect(messages).toEqual([{ type: "paths-updated" }]);

    connection.close();
    MockWebSocket.instances[1]!.emit("close");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  test("reports reconnected when the first successful open follows a retry", async () => {
    const openStates: boolean[] = [];
    connectWs(
      { baseUrl: "http://kernel.example", token: null },
      () => {},
      (event) => openStates.push(event.reconnected),
    );

    await vi.advanceTimersByTimeAsync(0);
    MockWebSocket.instances[0]!.emit("close");
    await vi.advanceTimersByTimeAsync(500);
    MockWebSocket.instances[1]!.emit("open");

    expect(openStates).toEqual([true]);
  });

  test("cancels a deferred open when closed before the handshake starts", async () => {
    const connection = connectWs(
      { baseUrl: "http://kernel.example", token: null },
      () => {},
    );

    connection.close();
    await vi.advanceTimersByTimeAsync(0);

    expect(MockWebSocket.instances).toHaveLength(0);
  });
});

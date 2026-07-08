import { vi } from "vitest";

type SocketListener = (event: { data: string }) => void | Promise<void>;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  private onMessage: SocketListener | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener): void {
    if (type === "message") {
      this.onMessage = listener;
    }
  }

  async emit(message: unknown): Promise<void> {
    await this.onMessage?.({ data: JSON.stringify(message) });
  }

  close(): void {
    /* noop */
  }
}

export function installMockWebSocket(): void {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
}

export function socketCount(): number {
  return MockWebSocket.instances.length;
}

export async function emitToAllSockets(message: unknown): Promise<void> {
  for (const ws of MockWebSocket.instances) {
    await ws.emit(message);
  }
}

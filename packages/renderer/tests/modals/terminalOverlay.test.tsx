/* Phase 12 — TerminalOverlay tests.
   Mocks both @xterm/xterm and @xterm/addon-fit because they assume a real
   DOM with measurable layout (canvas, ResizeObserver, getBoundingClientRect)
   that jsdom does not provide. We stub WebSocket too: tests construct a
   global MockWS so the overlay can be exercised without a live kernel.

   Assertions focus on the wiring contract, not the visual terminal:
     - render shows the session id in the header
     - clicking Detach calls onClose
     - the WS is opened with the right URL (http→ws, query param escaped)
     - incoming pane.snapshot messages are written through the bridge
     - typed input is sent via pane.input on the WS
     - unmount disposes the terminal and closes the WS
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

interface FakeXtermInstance {
  cols: number;
  rows: number;
  open: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  writes: string[];
  onData: ReturnType<typeof vi.fn>;
  loadAddon: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  disposed: boolean;
  /** Driven by tests: simulate the user typing into xterm. */
  fireInput(d: string): void;
}

const instances: FakeXtermInstance[] = [];

vi.mock("@xterm/xterm", () => {
  return {
    Terminal: class FakeTerminal {
      cols = 80;
      rows = 24;
      writes: string[] = [];
      disposed = false;
      private dataCb: ((d: string) => void) | null = null;

      open = vi.fn();
      loadAddon = vi.fn();
      write = vi.fn((s: string) => {
        this.writes.push(s);
      });
      onData = vi.fn((cb: (d: string) => void) => {
        this.dataCb = cb;
        return { dispose: () => { this.dataCb = null; } };
      });
      dispose = vi.fn(() => {
        this.disposed = true;
      });
      fireInput = (d: string): void => {
        if (this.dataCb !== null) this.dataCb(d);
      };

      constructor() {
        instances.push(this as unknown as FakeXtermInstance);
      }
    },
  };
});

vi.mock("@xterm/addon-fit", () => {
  return {
    FitAddon: class FakeFit {
      fit = vi.fn();
    },
  };
});

interface MockWebSocketInstance {
  url: string;
  sent: string[];
  readyState: number;
  onopen: ((e?: unknown) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e?: unknown) => void) | null;
  onerror: ((e?: unknown) => void) | null;
  send(d: string): void;
  close(): void;
  closed: boolean;
}

const wsInstances: MockWebSocketInstance[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  url: string;
  sent: string[] = [];
  readyState = 1; // OPEN — tests drive the bridge as if the socket connected.
  onopen: ((e?: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e?: unknown) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }
  send(d: string): void {
    this.sent.push(d);
  }
  close(): void {
    this.closed = true;
  }
}

describe("TerminalOverlay", () => {
  beforeEach(() => {
    instances.length = 0;
    wsInstances.length = 0;
    vi.stubGlobal("WebSocket", MockWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  async function importOverlay() {
    return await import("../../src/modals/TerminalOverlay.js");
  }

  it("renders the header with the tmux session id", async () => {
    const { TerminalOverlay } = await importOverlay();
    render(
      <TerminalOverlay
        tmuxSession="fmark-ag-c92e"
        token={null}
        baseUrl="http://localhost:7777"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/fmark-ag-c92e/)).toBeInTheDocument();
  });

  it("opens a WebSocket against /ws/pane?session=… (http → ws)", async () => {
    const { TerminalOverlay } = await importOverlay();
    render(
      <TerminalOverlay
        tmuxSession="fmark-ag-c92e"
        token={null}
        baseUrl="http://localhost:7777"
        onClose={() => {}}
      />,
    );
    expect(wsInstances.length).toBe(1);
    expect(wsInstances[0]!.url).toContain("ws://localhost:7777/ws/pane");
    expect(wsInstances[0]!.url).toContain("session=fmark-ag-c92e");
  });

  it("upgrades https → wss", async () => {
    const { TerminalOverlay } = await importOverlay();
    render(
      <TerminalOverlay
        tmuxSession="abc"
        token={null}
        baseUrl="https://api.example.com"
        onClose={() => {}}
      />,
    );
    expect(wsInstances[0]!.url.startsWith("wss://")).toBe(true);
  });

  it("appends ?token=… when a token is provided", async () => {
    const { TerminalOverlay } = await importOverlay();
    render(
      <TerminalOverlay
        tmuxSession="x"
        token="secret-token"
        baseUrl="http://localhost:7777"
        onClose={() => {}}
      />,
    );
    expect(wsInstances[0]!.url).toContain("token=secret-token");
  });

  it("writes pane.snapshot data through the bridge into the xterm", async () => {
    const { TerminalOverlay } = await importOverlay();
    render(
      <TerminalOverlay
        tmuxSession="x"
        token={null}
        baseUrl="http://localhost:7777"
        onClose={() => {}}
      />,
    );
    const ws = wsInstances[0]!;
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({ type: "pane.snapshot", data: "snap-A" }),
      });
    });
    const term = instances[0]!;
    expect(term.writes).toContain("snap-A");
  });

  it("ignores malformed JSON messages (no throw)", async () => {
    const { TerminalOverlay } = await importOverlay();
    render(
      <TerminalOverlay
        tmuxSession="x"
        token={null}
        baseUrl="http://localhost:7777"
        onClose={() => {}}
      />,
    );
    const ws = wsInstances[0]!;
    expect(() => {
      act(() => {
        ws.onmessage?.({ data: "not-json{" });
      });
    }).not.toThrow();
  });

  it("user-typed input flows out via pane.input on the WS", async () => {
    const { TerminalOverlay } = await importOverlay();
    render(
      <TerminalOverlay
        tmuxSession="x"
        token={null}
        baseUrl="http://localhost:7777"
        onClose={() => {}}
      />,
    );
    const term = instances[0]!;
    act(() => term.fireInput("hello"));
    const ws = wsInstances[0]!;
    expect(ws.sent).toContain(
      JSON.stringify({ type: "pane.input", data: "hello" }),
    );
  });

  it("Detach button calls onClose", async () => {
    const onClose = vi.fn();
    const { TerminalOverlay } = await importOverlay();
    const user = userEvent.setup();
    render(
      <TerminalOverlay
        tmuxSession="x"
        token={null}
        baseUrl="http://localhost:7777"
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: /detach/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop calls onClose; clicking inside does not", async () => {
    const onClose = vi.fn();
    const { TerminalOverlay } = await importOverlay();
    const user = userEvent.setup();
    const { container } = render(
      <TerminalOverlay
        tmuxSession="x"
        token={null}
        baseUrl="http://localhost:7777"
        onClose={onClose}
      />,
    );
    // Click inside the dialog should NOT close.
    await user.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    // Click backdrop → close.
    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("unmount disposes the terminal and closes the socket", async () => {
    const { TerminalOverlay } = await importOverlay();
    const { unmount } = render(
      <TerminalOverlay
        tmuxSession="x"
        token={null}
        baseUrl="http://localhost:7777"
        onClose={() => {}}
      />,
    );
    const term = instances[0]!;
    const ws = wsInstances[0]!;
    unmount();
    expect(term.disposed).toBe(true);
    expect(ws.closed).toBe(true);
  });
});

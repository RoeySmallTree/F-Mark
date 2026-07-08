/* Phase 12 — ReconnectModal tests.
   Renders the `/guide?agent_id=…&session_id=…&runtime_id=…` markdown for an
   offline agent so the user can paste it back into their CLI. Uses the
   project's existing fetch pattern (Authorization: Bearer <token>). */

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

const GUIDE_MD =
  "# Reconnect ag-c92e\n\nPaste this into your CLI to resume.\n\n```\nfmark connect --agent ag-c92e\n```\n";

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

describe("ReconnectModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  async function flushPromises() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("fetches /guide with the three identifiers on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(GUIDE_MD));
    vi.stubGlobal("fetch", fetchMock);
    const { ReconnectModal } = await import(
      "../../src/modals/ReconnectModal.js"
    );
    render(
      <ReconnectModal
        participantId="ag-c92e"
        sessionId="2026-05-22-launch-review"
        runtimeId="claude"
        baseUrl="http://localhost:7777"
        token={null}
        onClose={() => {}}
      />,
    );
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/guide");
    expect(url).toContain("agent_id=ag-c92e");
    expect(url).toContain("session_id=2026-05-22-launch-review");
    expect(url).toContain("runtime_id=claude");
  });

  it("attaches the Bearer token when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(GUIDE_MD));
    vi.stubGlobal("fetch", fetchMock);
    const { ReconnectModal } = await import(
      "../../src/modals/ReconnectModal.js"
    );
    render(
      <ReconnectModal
        participantId="ag-c92e"
        sessionId="2026-05-22-x"
        runtimeId="claude"
        baseUrl="http://localhost:7777"
        token="secret-token"
        onClose={() => {}}
      />,
    );
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)?.Authorization,
    ).toBe("Bearer secret-token");
  });

  it("renders the markdown body after fetch resolves", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(GUIDE_MD));
    vi.stubGlobal("fetch", fetchMock);
    const { ReconnectModal } = await import(
      "../../src/modals/ReconnectModal.js"
    );
    render(
      <ReconnectModal
        participantId="ag-c92e"
        sessionId="2026-05-22-x"
        runtimeId="claude"
        baseUrl="http://localhost:7777"
        token={null}
        onClose={() => {}}
      />,
    );
    await flushPromises();
    expect(
      screen.getByRole("heading", { name: /reconnect ag-c92e/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/fmark connect --agent ag-c92e/)).toBeInTheDocument();
  });

  it("shows a loading state before fetch resolves", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const pending = new Promise<Response>((r) => {
      resolveFetch = r;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
    const { ReconnectModal } = await import(
      "../../src/modals/ReconnectModal.js"
    );
    render(
      <ReconnectModal
        participantId="ag-c92e"
        sessionId="2026-05-22-x"
        runtimeId="claude"
        baseUrl="http://localhost:7777"
        token={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    resolveFetch(textResponse(GUIDE_MD));
    await flushPromises();
  });

  it("surfaces an error message on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(textResponse("server error", 500)),
    );
    const { ReconnectModal } = await import(
      "../../src/modals/ReconnectModal.js"
    );
    render(
      <ReconnectModal
        participantId="ag-c92e"
        sessionId="2026-05-22-x"
        runtimeId="claude"
        baseUrl="http://localhost:7777"
        token={null}
        onClose={() => {}}
      />,
    );
    await flushPromises();
    expect(screen.getByRole("alert").textContent).toMatch(/500|failed/i);
  });

  it("Copy button writes the guide markdown to navigator.clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(GUIDE_MD)));
    const { ReconnectModal } = await import(
      "../../src/modals/ReconnectModal.js"
    );
    render(
      <ReconnectModal
        participantId="ag-c92e"
        sessionId="2026-05-22-x"
        runtimeId="claude"
        baseUrl="http://localhost:7777"
        token={null}
        onClose={() => {}}
      />,
    );
    await flushPromises();
    const copyBtn = screen.getByRole("button", { name: /^copy$/i });
    await user.click(copyBtn);
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(GUIDE_MD);
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  });

  it("clicking the X close button calls onClose", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(GUIDE_MD)));
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { ReconnectModal } = await import(
      "../../src/modals/ReconnectModal.js"
    );
    render(
      <ReconnectModal
        participantId="ag-c92e"
        sessionId="2026-05-22-x"
        runtimeId="claude"
        baseUrl="http://localhost:7777"
        token={null}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop calls onClose; clicking inside does not", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(GUIDE_MD)));
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { ReconnectModal } = await import(
      "../../src/modals/ReconnectModal.js"
    );
    const { container } = render(
      <ReconnectModal
        participantId="ag-c92e"
        sessionId="2026-05-22-x"
        runtimeId="claude"
        baseUrl="http://localhost:7777"
        token={null}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});

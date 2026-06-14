import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  AccessRequestEventRecord,
  AccessRequestPayload,
  AnyEventRecord,
  Participant,
} from "@f-mark/shared";
import { AccessRequestCard } from "./AccessRequestCard";
import { useStore } from "../state/store";

const PARTICIPANTS: Record<string, Participant> = {
  "ag-claude": { kind: "agent", name: "Claude", color: "#b86a1f" },
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
};

function cssRule(selector: string): string {
  const css =
    readFileSync(resolve(process.cwd(), "src/cards/cards.css"), "utf8") +
    "\n" +
    readFileSync(resolve(process.cwd(), "src/agent-components.css"), "utf8");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

function makeRequest(overrides: Partial<AccessRequestPayload> = {}): AccessRequestEventRecord {
  return {
    filename: "20260609T100000Z_ag-claude.access-request.json",
    timestamp: "20260609T100000Z",
    participant_id: "ag-claude",
    kind: "access-request",
    payload: {
      schema: "fmark.access-request.v1",
      request_id: "req_1",
      status: "open",
      request_type: "permission",
      runtime_id: "claude",
      hook_event_name: "PermissionRequest",
      title: "Approve tool use",
      response_channel: "hook",
      created_at: "2026-06-09T10:00:00Z",
      ...overrides,
    },
  };
}

function renderCard(event: AccessRequestEventRecord, allEvents: AnyEventRecord[] = [event]): void {
  render(
    <AccessRequestCard
      event={event}
      participants={PARTICIPANTS}
      allEvents={allEvents}
    />,
  );
}

describe("<AccessRequestCard>", () => {
  beforeEach(() => {
    useStore.setState({
      token: "tok",
      currentSessionId: "session-1",
      currentUserId: "us-a7f3",
      activePath: "/workspace/F-Mark",
      openFile: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders Edit approvals with a file card and diff", () => {
    renderCard(
      makeRequest({
        tool_name: "Edit",
        tool_input: {
          file_path: "/workspace/F-Mark/src/App.tsx",
          old_string: "return oldValue;",
          new_string: "return newValue;",
          replace_all: false,
        },
      }),
    );

    expect(screen.getByRole("button", { name: /App\.tsx/i })).toBeInTheDocument();
    const diffSection = screen.getByRole("heading", { name: "Diff" }).closest("section");
    expect(diffSection).not.toBeNull();
    expect(within(diffSection as HTMLElement).getByText("return oldValue;")).toBeInTheDocument();
    expect(within(diffSection as HTMLElement).getByText("return newValue;")).toBeInTheDocument();
    expect(within(diffSection as HTMLElement).getByRole("button", { name: "Inline" }))
      .toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      within(diffSection as HTMLElement).getByRole("button", { name: "Side by side" }),
    );

    expect(within(diffSection as HTMLElement).getByTestId("tool-diff-before-pane"))
      .toBeInTheDocument();
    expect(within(diffSection as HTMLElement).getByTestId("tool-diff-after-pane"))
      .toBeInTheDocument();
  });

  it("renders Bash approvals with description, command, cwd, and mode", () => {
    renderCard(
      makeRequest({
        tool_name: "Bash",
        tool_input: {
          description: "List project files",
          command: "ls -la",
        },
        cwd: "/workspace/F-Mark",
        permission_mode: "ask",
      }),
    );

    expect(screen.getByText("List project files")).toBeInTheDocument();
    const commandSection = screen.getByRole("heading", { name: "Command" }).closest("section");
    expect(commandSection).not.toBeNull();
    expect(within(commandSection as HTMLElement).getByText("ls -la")).toBeInTheDocument();
    expect(screen.getByText(/cwd/)).toBeInTheDocument();
    expect(screen.getByText(/ask/)).toBeInTheDocument();
  });

  it("renders provider-specific options and sends the selected option id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderCard(
      makeRequest({
        runtime_id: "codex",
        response_channel: "terminal",
        tool_name: "Bash",
        command: "timeout 10 ./node_modules/.bin/tsx src/index.ts mcp",
        suggestions: [
          {
            id: "terminal:1",
            label: "Yes",
            decision: "approve",
            terminal_input: "1",
          },
          {
            id: "terminal:2",
            label: "Yes, and allow access to .bin/ and timeout 10 commands",
            decision: "approve",
            terminal_input: "2",
          },
          {
            id: "terminal:3",
            label: "No",
            decision: "deny",
            terminal_input: "3",
          },
        ],
      }),
    );

    expect(screen.getByRole("button", { name: "Approve: Yes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny: No" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Approve: Yes, and allow access to .bin/ and timeout 10 commands",
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      decision: "approve",
      option_id: "terminal:2",
    });
  });

  it("renders explicit prominent default decision labels", () => {
    renderCard(makeRequest({ tool_name: "Bash", command: "ls -la" }));

    const approve = screen.getByRole("button", { name: "Approve access request" });
    const deny = screen.getByRole("button", { name: "Deny access request" });

    expect(approve).toHaveTextContent("Approve");
    expect(approve).toHaveAttribute("data-decision", "approve");
    expect(deny).toHaveTextContent("Deny");
    expect(deny).toHaveAttribute("data-decision", "deny");
  });

  it("keeps access request raw details on readable theme-tokenized colors", () => {
    renderCard(
      makeRequest({
        tool_name: "mcp__fmark__fmark_post_prose",
        tool_input: { text: "Readable details" },
        raw: { tool_input: { text: "Readable details" } },
      }),
    );

    const details = screen.getByText("Raw details").closest("details");
    expect(details).not.toBeNull();
    expect(details).toHaveClass("tool-raw-details");
    expect(within(details as HTMLElement).getByText(/Readable details/).tagName).toBe("PRE");

    const cardRule = cssRule(".approval");
    expect(cardRule).toContain("--tool-card-pre-bg:");
    expect(cardRule).toContain("--tool-card-pre-fg: var(--ink-2);");
    expect(cardRule).toContain("--tool-card-muted: var(--ink-3);");

    const rawRule = cssRule(".tool-raw-details pre");
    expect(rawRule).toContain("background: var(--tool-card-pre-bg, var(--panel));");
    expect(rawRule).toContain("color: var(--tool-card-pre-fg, var(--ink-2));");

    const approveRule = cssRule(".btn-approve");
    const denyRule = cssRule(".btn-deny");
    expect(approveRule).toContain("var(--green)");
    expect(denyRule).toContain("var(--rose)");
  });

  it("renders stale approval action failures as structured UI", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "access request is not open" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderCard(makeRequest({ tool_name: "Bash", command: "ls -la" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve access request" }));

    expect(await screen.findByText("Request already closed")).toBeInTheDocument();
    expect(screen.getByText(/no longer pending/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Approve access request" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("Technical details")).toBeInTheDocument();
  });
});

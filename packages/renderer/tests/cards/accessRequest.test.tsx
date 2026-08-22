/* AccessRequestCard — covers the three body-rendering branches and the
   approve/deny callback wiring. Fix #2 makes the kernel populate `message`
   for fmark MCP tools, so this card should now render a body in cases
   that previously fell through to the empty render path. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { AccessRequestPayload, AnyEventRecord } from "@f-mark/shared";
import { AccessRequestCard } from "../../src/cards/AccessRequestCard.js";
import { PARTICIPANTS, resetStore } from "./_helpers.js";

function makeAccessRequest(
  filename: string,
  participantId: string,
  payload: Partial<AccessRequestPayload> & {
    request_id: string;
    title: string;
  },
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "access-request",
    payload: {
      schema: "fmark.access-request.v1",
      status: "open",
      request_type: "tool",
      runtime_id: "claude",
      hook_event_name: "PermissionRequest",
      response_channel: "hook",
      created_at: "2026-05-27T10:00:00.000Z",
      ...payload,
    } as AccessRequestPayload,
  };
}

describe("AccessRequestCard — body rendering branches", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  function sectionByTitle(container: HTMLElement, title: string): HTMLElement | null {
    return (
      Array.from(container.querySelectorAll(".io")).find(
        (section) => section.querySelector("h4")?.textContent === title,
      ) ?? null
    ) as HTMLElement | null;
  }

  test("renders <pre> body when `command` is present (Bash-style)", () => {
    const event = makeAccessRequest(
      "20260527T100000Z_ag-c92e.access-request.json",
      "ag-c92e",
      {
        request_id: "ar-1",
        title: "Bash",
        command: "ls -la",
        request_type: "command",
      },
    );
    const { container } = render(
      <AccessRequestCard
        event={event}
        participants={PARTICIPANTS}
        allEvents={[event]}
      />,
    );
    const commandSection = sectionByTitle(container, "Command");
    expect(commandSection).not.toBeNull();
    const pre = commandSection!.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe("ls -la");
    /* Message branch must not also render. */
    expect(sectionByTitle(container, "Request")).toBeNull();
  });

  test("renders <p> body when `message` is present and no `command`", () => {
    const event = makeAccessRequest(
      "20260527T100000Z_ag-c92e.access-request.json",
      "ag-c92e",
      {
        request_id: "ar-2",
        title: "mcp__fmark__fmark_post_prose",
        message: "Hello world from the agent",
      },
    );
    const { container } = render(
      <AccessRequestCard
        event={event}
        participants={PARTICIPANTS}
        allEvents={[event]}
      />,
    );
    const requestSection = sectionByTitle(container, "Request");
    expect(requestSection).not.toBeNull();
    const p = requestSection!.querySelector("p");
    expect(p).not.toBeNull();
    expect(p!.textContent).toBe("Hello world from the agent");
  });

  test("renders no body when neither `command` nor `message` is set", () => {
    const event = makeAccessRequest(
      "20260527T100000Z_ag-c92e.access-request.json",
      "ag-c92e",
      {
        request_id: "ar-3",
        title: "mcp__example__bare",
      },
    );
    const { container } = render(
      <AccessRequestCard
        event={event}
        participants={PARTICIPANTS}
        allEvents={[event]}
      />,
    );
    expect(container.querySelector("pre.access-request-command")).toBeNull();
    expect(container.querySelector("p.access-request-message")).toBeNull();
  });

  test("approve button fires the respond API with `approve`", async () => {
    const event = makeAccessRequest(
      "20260527T100000Z_ag-c92e.access-request.json",
      "ag-c92e",
      {
        request_id: "ar-approve",
        title: "mcp__fmark__fmark_post_prose",
        message: "preview",
      },
    );
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, delivered: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AccessRequestCard
        event={event}
        participants={PARTICIPANTS}
        allEvents={[event]}
      />,
    );
    const approve = screen.getByRole("button", { name: /^Allow/i });
    expect(approve).toHaveTextContent("Allow");
    expect(approve).toHaveAttribute("data-decision", "approve");
    fireEvent.click(approve);

    await waitFor(() => {
      const respondCall = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/respond"),
      );
      expect(respondCall).toBeDefined();
      const body = JSON.parse(String((respondCall![1] as RequestInit).body));
      expect(body.decision).toBe("approve");
      expect(body.participant_id).toBe("us-a7f3");
    });

    vi.unstubAllGlobals();
  });

  test("deny button fires the respond API with `deny`", async () => {
    const event = makeAccessRequest(
      "20260527T100000Z_ag-c92e.access-request.json",
      "ag-c92e",
      {
        request_id: "ar-deny",
        title: "mcp__fmark__fmark_post_prose",
        message: "preview",
      },
    );
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, delivered: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AccessRequestCard
        event={event}
        participants={PARTICIPANTS}
        allEvents={[event]}
      />,
    );
    const deny = screen.getByRole("button", { name: /Cancel/i });
    expect(deny).toHaveTextContent("Cancel");
    expect(deny).toHaveAttribute("data-decision", "deny");
    fireEvent.click(deny);

    await waitFor(() => {
      const respondCall = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/respond"),
      );
      expect(respondCall).toBeDefined();
      const body = JSON.parse(String((respondCall![1] as RequestInit).body));
      expect(body.decision).toBe("deny");
    });

    vi.unstubAllGlobals();
  });

  test("closed (responded) request hides the approve/deny buttons", () => {
    const requestEvent = makeAccessRequest(
      "20260527T100000Z_ag-c92e.access-request.json",
      "ag-c92e",
      {
        request_id: "ar-responded",
        title: "mcp__fmark__fmark_post_prose",
        message: "preview",
      },
    );
    const responseEvent: AnyEventRecord = {
      filename: "20260527T100100Z_us-a7f3.access-response.json",
      timestamp: "20260527T100100Z",
      participant_id: "us-a7f3",
      kind: "access-response",
      payload: {
        schema: "fmark.access-response.v1",
        request_id: "ar-responded",
        decision: "approve",
        status: "approved",
        delivered: true,
        delivery: "hook",
        responded_at: "2026-05-27T10:01:00.000Z",
      },
    };

    render(
      <AccessRequestCard
        event={requestEvent}
        participants={PARTICIPANTS}
        allEvents={[requestEvent, responseEvent]}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Allow/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull();
  });

  test("a denied request renders both the status and the timestamp (M7)", () => {
    const requestEvent = makeAccessRequest(
      "20260527T100000Z_ag-c92e.access-request.json",
      "ag-c92e",
      {
        request_id: "ar-denied",
        title: "mcp__fmark__fmark_post_prose",
        message: "preview",
      },
    );
    const responseEvent: AnyEventRecord = {
      filename: "20260527T100100Z_us-a7f3.access-response.json",
      timestamp: "20260527T100100Z",
      participant_id: "us-a7f3",
      kind: "access-response",
      payload: {
        schema: "fmark.access-response.v1",
        request_id: "ar-denied",
        decision: "deny",
        status: "denied",
        delivered: true,
        delivery: "hook",
        responded_at: "2026-05-27T10:01:00.000Z",
      },
    };

    const { container } = render(
      <AccessRequestCard
        event={requestEvent}
        participants={PARTICIPANTS}
        allEvents={[requestEvent, responseEvent]}
      />,
    );
    const decision = container.querySelector(".approval-decision");
    expect(decision).not.toBeNull();
    expect(decision!.textContent).toContain("denied");
    /* Not just the bare status word — a real timestamp must follow it. */
    expect(decision!.textContent).not.toBe(" · denied");
  });
});

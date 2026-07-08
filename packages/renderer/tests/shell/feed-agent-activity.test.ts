import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { createElement } from "react";
import type {
  AccessRequestPayload,
  AccessResponsePayload,
  AnyEventRecord,
  ProsePayload,
} from "@f-mark/shared";
import { Feed } from "../../src/shell/Feed.js";
import { resetStore } from "../cards/_helpers.js";
import { renderWithAgentSpawn } from "../agentSpawnProvider.js";

function event(
  input: Pick<
    AnyEventRecord,
    "filename" | "timestamp" | "participant_id" | "kind"
  > & {
    payload: unknown;
  },
): AnyEventRecord {
  return input as AnyEventRecord;
}

const PROSE_EVENT = event({
  filename: "20260615T100000Z_ag-c92e.prose.md",
  timestamp: "20260615T100000Z",
  participant_id: "ag-c92e",
  kind: "prose",
  payload: { content: "Working" } satisfies ProsePayload,
});

const ACCESS_REQUEST = event({
  filename: "20260615T100100Z_ag-c92e.access-request.json",
  timestamp: "20260615T100100Z",
  participant_id: "ag-c92e",
  kind: "access-request",
  payload: {
    schema: "fmark.access-request.v1",
    request_id: "ar-1",
    status: "open",
    request_type: "permission",
    runtime_id: "claude",
    hook_event_name: "PermissionRequest",
    response_channel: "hook",
    created_at: "2026-06-15T10:01:00.000Z",
    title: "Terminal approval",
    message: "Allow the tool?",
    suggestions: [],
  } satisfies AccessRequestPayload,
});

const ACCESS_RESPONSE = event({
  filename: "20260615T100200Z_us-roey.access-response.json",
  timestamp: "20260615T100200Z",
  participant_id: "us-roey",
  kind: "access-response",
  payload: {
    schema: "fmark.access-response.v1",
    request_id: "ar-1",
    decision: "approve",
    status: "approved",
    delivered: true,
    delivery: "terminal",
    responded_at: "2026-06-15T10:02:00.000Z",
  } satisfies AccessResponsePayload,
});

describe("Feed agent activity", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ agents: [], removed_agents: [], terminals: [] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("reports an open access request as waiting for approval", () => {
    resetStore({
      events: [PROSE_EVENT, ACCESS_REQUEST],
      presence: { "ag-c92e": { state: "online", last_hook_at: 1 } },
    });

    renderWithAgentSpawn(createElement(Feed));

    expect(
      screen.getByRole("status", { name: /claude is waiting for approval/i }),
    ).toBeInTheDocument();
  });

  it("skips a closed access request when deriving the working-strip verb", () => {
    resetStore({
      events: [PROSE_EVENT, ACCESS_REQUEST, ACCESS_RESPONSE],
      presence: { "ag-c92e": { state: "online", last_hook_at: 1 } },
    });

    renderWithAgentSpawn(createElement(Feed));

    expect(
      screen.getByRole("status", { name: /claude is thinking/i }),
    ).toBeInTheDocument();
  });
});

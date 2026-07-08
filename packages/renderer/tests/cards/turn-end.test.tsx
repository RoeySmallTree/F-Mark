import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { AnyEventRecord } from "@f-mark/shared";
import { TurnEndDivider } from "../../src/cards/TurnEndDivider.js";
import { PARTICIPANTS, makeTurnEnd, resetStore } from "./_helpers.js";

function event(
  kind: AnyEventRecord["kind"],
  participantId: string,
  ts: string,
  payload: unknown = {},
): AnyEventRecord {
  return {
    filename: `${ts}_${participantId}.${kind}.json`,
    timestamp: ts,
    participant_id: participantId,
    kind,
    payload,
  } as AnyEventRecord;
}

describe("TurnEndDivider", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("user participant id yields .turn-end.user class and name in label", () => {
    const ev = makeTurnEnd(
      "20260522T130000Z_us-a7f3.turn-end.json",
      "us-a7f3",
    );
    const { container } = render(
      <TurnEndDivider event={ev} participants={PARTICIPANTS} />,
    );
    const root = container.querySelector(".turn-end");
    expect(root).not.toBeNull();
    expect(root!.classList.contains("user")).toBe(true);
    expect(root!.classList.contains("agent")).toBe(false);
    expect(root!.textContent).toMatch(/Roey/);
  });

  test("agent participant id yields .turn-end.agent class", () => {
    const ev = makeTurnEnd(
      "20260522T130100Z_ag-c92e.turn-end.json",
      "ag-c92e",
    );
    const { container } = render(
      <TurnEndDivider event={ev} participants={PARTICIPANTS} />,
    );
    const root = container.querySelector(".turn-end");
    expect(root!.classList.contains("agent")).toBe(true);
    expect(root!.classList.contains("user")).toBe(false);
    expect(root!.textContent).toMatch(/Claude/);
  });

  test("agent turn-end label includes approval-adjusted elapsed time", () => {
    const userBoundary = makeTurnEnd(
      "20260522T130000Z_us-a7f3.turn-end.json",
      "us-a7f3",
    );
    const approval = event(
      "access-request",
      "ag-c92e",
      "20260522T130005Z",
      {
        schema: "fmark.access-request.v1",
        request_id: "req_1",
        status: "open",
        request_type: "permission",
        runtime_id: "claude",
        hook_event_name: "PermissionRequest",
        response_channel: "hook",
        created_at: "2026-05-22T13:00:05.000Z",
      },
    );
    const response = event(
      "access-response",
      "us-a7f3",
      "20260522T130035Z",
      {
        schema: "fmark.access-response.v1",
        request_id: "req_1",
        decision: "approve",
        status: "approved",
        delivered: true,
        delivery: "hook",
        responded_at: "2026-05-22T13:00:35.000Z",
      },
    );
    const agentEnd = makeTurnEnd(
      "20260522T130040Z_ag-c92e.turn-end.json",
      "ag-c92e",
    );

    const { container } = render(
      <TurnEndDivider
        event={agentEnd}
        participants={PARTICIPANTS}
        allEvents={[
          userBoundary,
          event("tool-use", "ag-c92e", "20260522T130002Z"),
          approval,
          response,
          agentEnd,
        ]}
      />,
    );

    expect(container.querySelector(".turn-end")!.textContent).toMatch(
      /10\s*s elapsed/,
    );
  });
});

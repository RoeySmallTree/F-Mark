import { describe, expect, it } from "vitest";
import type { Participant, WakeSessionResponse } from "@f-mark/shared";
import {
  buildWakeNotice,
  wakeNoticeText,
} from "../../src/compose/wakeNotice.js";

const participants = {
  "ag-alice": { name: "Alice" },
  "ag-bob": { name: "Bob" },
} as unknown as Record<string, Participant>;

function response(over: Partial<WakeSessionResponse>): WakeSessionResponse {
  return {
    session_id: "s1",
    notified: [],
    delivered: [],
    skipped: [],
    event_count: 0,
    ...over,
  } as WakeSessionResponse;
}

describe("buildWakeNotice", () => {
  it("says nothing when every agent was reached", () => {
    const notice = buildWakeNotice(
      response({ notified: ["ag-alice", "ag-bob"] }),
      participants,
    );
    expect(notice).toBeNull();
  });

  it("names the agent that was left out and why", () => {
    const notice = buildWakeNotice(
      response({
        notified: ["ag-alice"],
        skipped: [{ participant_id: "ag-bob", reason: "not-active" }],
      }),
      participants,
    );
    expect(notice).not.toBeNull();
    expect(wakeNoticeText(notice!)).toBe(
      "Sent to Alice. Not notified: Bob (working in another session)",
    );
  });

  /* The case the whole feature exists for: two agents, one replies. Before
     this, the second left no trace at all. */
  it("reports a miss even when nobody at all was notified", () => {
    const notice = buildWakeNotice(
      response({
        skipped: [{ participant_id: "ag-bob", reason: "paused" }],
      }),
      participants,
    );
    expect(wakeNoticeText(notice!)).toBe("No agent was notified — Bob (paused)");
  });

  it("stays silent when the only skip was an agent with nothing new to read", () => {
    const notice = buildWakeNotice(
      response({
        notified: ["ag-alice"],
        skipped: [{ participant_id: "ag-bob", reason: "no-unread-events" }],
      }),
      participants,
    );
    expect(notice).toBeNull();
  });

  it("falls back to the raw reason rather than dropping an unknown one", () => {
    const notice = buildWakeNotice(
      response({
        skipped: [
          {
            participant_id: "ag-bob",
            reason: "some-future-reason" as never,
          },
        ],
      }),
      participants,
    );
    expect(wakeNoticeText(notice!)).toContain("some-future-reason");
  });

  it("falls back to the participant id when the name is unknown", () => {
    const notice = buildWakeNotice(
      response({
        skipped: [{ participant_id: "ag-ghost", reason: "not-active" }],
      }),
      participants,
    );
    expect(wakeNoticeText(notice!)).toContain("ag-ghost");
  });
});

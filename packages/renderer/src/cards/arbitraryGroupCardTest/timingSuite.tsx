import { expect, it } from "vitest";
import {
  accessResponse,
  LIVE_TIMING_NOW,
  makeAnsweredApprovalItems,
  makeGroup,
  makeOpenApprovalItems,
  PARTICIPANTS,
} from "./fixtures";
import {
  expectHeaderOmitsInvalidCompletedTiming,
  expectHeaderOmitsNaNWithFallback,
  getGroupStatus,
} from "./queries";
import { renderGroup } from "./render";

export function registerArbitraryGroupCardTimingTests() {
  it("pauses streaming elapsed at an open approval request", () => {
    const items = makeOpenApprovalItems();
    renderGroup({
      allEvents: items,
      group: makeGroup({ items, status: "streaming", accessRequestCount: 1, timeRangeEnd: "20260523T100005Z" }),
      now: LIVE_TIMING_NOW,
    });

    expect(getGroupStatus()).toHaveTextContent(/5\s*s/);
    expect(getGroupStatus()).not.toHaveTextContent(/1\s*min|60\s*s/);
  });

  it("subtracts answered approval wait time from streaming elapsed", () => {
    const items = makeAnsweredApprovalItems();
    renderGroup({
      allEvents: [...items, accessResponse("20260523T100035Z")],
      group: makeGroup({ items, status: "streaming", toolCount: 2, accessRequestCount: 1, timeRangeEnd: "20260523T100040Z" }),
      now: LIVE_TIMING_NOW,
    });
    expect(getGroupStatus()).toHaveTextContent(/30\s*s/);
  });

  it("never renders NaN for malformed live timing and shows a working fallback", () => {
    renderGroup({
      group: makeGroup({ timeRangeStart: "not-a-date", timeRangeEnd: "also-not-a-date", status: "streaming", toolCount: 1 }),
      participants: PARTICIPANTS,
      now: LIVE_TIMING_NOW,
    });
    expectHeaderOmitsNaNWithFallback();
  });

  it("omits invalid completed timing instead of rendering NaN", () => {
    renderGroup({
      group: makeGroup({ status: "ended", timeRangeStart: undefined as unknown as string, timeRangeEnd: "broken", toolCount: 1 }),
      participants: PARTICIPANTS,
      now: LIVE_TIMING_NOW,
    });
    expectHeaderOmitsInvalidCompletedTiming();
  });
}

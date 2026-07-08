import { expect, it } from "vitest";
import { makeGroup, prose, tool } from "./fixtures";
import { clickGroupToggle, expectGroupToggleExpanded, getGroupToggles } from "./queries";
import { accordion, groupCard, renderAccordion } from "./render";

export function registerArbitraryGroupCardAccordionTests() {
  it("under an accordion, opening one toolbox collapses the previously-open one", () => {
    renderAccordion(
      <>
        {groupCard({ group: makeGroup({ status: "concluded" }), groupId: "A" })}
        {groupCard({ group: makeReadGroupB("concluded"), groupId: "B", now: new Date("2026-05-23T10:00:15Z") })}
      </>,
    );

    const [headerA, headerB] = getGroupToggles();
    expectGroupToggleExpanded(headerA!, false);
    expectGroupToggleExpanded(headerB!, false);

    clickGroupToggle(0);
    expectGroupToggleExpanded(headerA!, true);

    clickGroupToggle(1);
    expectGroupToggleExpanded(headerB!, true);
    expectGroupToggleExpanded(headerA!, false);
  });

  it("a newly appeared streaming toolbox replaces the previous auto-opened toolbox", () => {
    const streamingA = groupCard({ group: makeGroup({ status: "streaming" }), groupId: "A" });
    const { rerender } = renderAccordion(streamingA);

    expectGroupToggleExpanded(getGroupToggles()[0]!, true);

    rerender(accordion(
      <>
        {streamingA}
        {groupCard({ group: makeReadGroupB("streaming", "working"), groupId: "B", now: new Date("2026-05-23T10:00:15Z") })}
      </>,
    ));

    const [headerA, headerB] = getGroupToggles();
    expectGroupToggleExpanded(headerB!, true);
    expectGroupToggleExpanded(headerA!, false);
  });

  it("a newly appeared streaming toolbox does not close a manually-opened toolbox", () => {
    const concludedA = groupCard({ group: makeGroup({ status: "concluded" }), groupId: "A" });
    const { rerender } = renderAccordion(concludedA);

    clickGroupToggle();
    expectGroupToggleExpanded(getGroupToggles()[0]!, true);

    rerender(accordion(
      <>
        {concludedA}
        {groupCard({ group: makeReadGroupB("streaming", "working"), groupId: "B", now: new Date("2026-05-23T10:00:15Z") })}
      </>,
    ));

    const [headerA, headerB] = getGroupToggles();
    expectGroupToggleExpanded(headerB!, true);
    expectGroupToggleExpanded(headerA!, true);
  });
}

function makeReadGroupB(status: "concluded" | "streaming", proseContent = "bye") {
  return makeGroup({
    status,
    items: [
      prose(proseContent, "20260523T100010Z"),
      tool("Read", "20260523T100012Z"),
    ],
    timeRangeStart: "20260523T100010Z",
    timeRangeEnd: "20260523T100012Z",
  });
}

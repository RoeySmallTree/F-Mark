import { expect, it } from "vitest";
import { makeGroup, PARTICIPANTS, prose } from "./fixtures";
import {
  expectGroupPreviewTextVisible,
  expectGroupTextHidden,
  expectGroupTextVisible,
  expectGroupToolTypeVisible,
  getGroupToggle,
} from "./queries";
import { renderGroup } from "./render";

export function registerArbitraryGroupCardVisibilityTests() {
  it("is OPEN by default when status=streaming", () => {
    renderGroup();
    expectGroupTextVisible("hmm");
    expectGroupToolTypeVisible("Bash");
  });

  it("renders arbitrary prose as a regular message inside a mixed toolbox", () => {
    const { container } = renderGroup({ participants: PARTICIPANTS });
    const header = getGroupToggle();

    expect(header).toHaveTextContent("Azrok");
    expect(header).not.toHaveTextContent("thinking to himself");
    expect(container.querySelector(".thinking-card")).toBeNull();
    expect(container.querySelector(".toolbox .msg-card")).not.toBeNull();
    expectGroupTextVisible("hmm");
  });

  it("labels the toolbox as thinking only when every item is thought prose", () => {
    renderGroup({
      group: makeGroup({
        items: [
          prose("hmm", "20260523T100000Z"),
          prose("still thinking", "20260523T100002Z"),
        ],
        toolCount: 0,
      }),
      participants: PARTICIPANTS,
    });

    expect(getGroupToggle()).toHaveTextContent("thinking to himself");
  });

  it("is COLLAPSED by default when status=concluded", () => {
    renderGroup({ groupPatch: { status: "concluded" } });
    expectGroupPreviewTextVisible("hmm");
    expectGroupTextHidden("hmm");
  });

  it("is COLLAPSED by default when status=ended", () => {
    renderGroup({ group: makeGroup({ status: "ended" }) });
    expectGroupPreviewTextVisible("hmm");
    expectGroupTextHidden("hmm");
  });
}

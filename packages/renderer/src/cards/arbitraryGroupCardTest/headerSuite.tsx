import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { accessRequest, LIVE_TIMING_NOW, makeGroup, PARTICIPANTS, prose, tool } from "./fixtures";
import { expectHeaderSeparatesTitleAndStatus, getGroupToggle } from "./queries";
import { renderGroup } from "./render";

export function registerArbitraryGroupCardHeaderTests() {
  it("title shows tool count", () => {
    renderGroup({ groupPatch: { toolCount: 3 }, now: new Date() });
    expect(screen.getByText(/3 tools?/)).toBeInTheDocument();
  });

  it("separates the agent title from the right-side clock status metadata", () => {
    renderGroup({ groupPatch: { toolCount: 3 }, participants: PARTICIPANTS });
    expectHeaderSeparatesTitleAndStatus();
  });

  it("title resolves the participant display name and keeps the raw id as detail", () => {
    renderGroup({ groupPatch: { status: "ended" }, participants: PARTICIPANTS });
    const toggle = getGroupToggle();

    expect(toggle).toHaveTextContent("Azrok");
    expect(toggle).not.toHaveTextContent("ag-claude");
    expect(screen.getByTitle("ag-claude")).toBeInTheDocument();
  });

  it("falls back to the participant id when the registry is missing it", () => {
    renderGroup({ groupPatch: { status: "ended" } });
    expect(getGroupToggle()).toHaveTextContent("ag-claude");
  });

  it("title shows approval count", () => {
    renderGroup({
      groupPatch: {
        items: [
          prose("hmm", "20260523T100000Z"),
          tool("Bash", "20260523T100002Z"),
          accessRequest("20260523T100003Z"),
        ],
        accessRequestCount: 1,
      },
      now: new Date(),
    });
    expect(screen.getByText(/1 approval/)).toBeInTheDocument();
  });

  it("title shows time range start→end when concluded", () => {
    renderGroup({ groupPatch: { status: "concluded" }, now: new Date() });
    expect(screen.getByText(/2\s*s|2s/)).toBeInTheDocument();
  });

  it("title shows elapsed-since-start when streaming", () => {
    renderGroup({ groupPatch: { status: "streaming" }, now: LIVE_TIMING_NOW });
    expect(screen.getByText(/1\s*min|60\s*s/)).toBeInTheDocument();
  });
}

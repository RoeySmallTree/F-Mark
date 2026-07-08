import type { AnyEventRecord } from "@f-mark/shared";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { makeBashToolGroup, makeGroup, tool } from "./fixtures";
import {
  clickGroupToggle,
  expectCommandSummaryHidden,
  expectCommandSummaryVisible,
  expectGroupTextVisible,
  expectNoOlderToolsButton,
  expectToolDetailExpansion,
  showOlderToolsButton,
} from "./queries";
import { groupCard, renderGroup } from "./render";

export function registerArbitraryGroupCardDisclosureTests() {
  it("clicking the header toggles open/closed", () => {
    renderGroup({ groupPatch: { status: "concluded" }, now: new Date() });
    clickGroupToggle();
    expectGroupTextVisible("hmm");
  });

  it("auto-opens only the latest tool while streaming and closes it when inactive", () => {
    const group = makeBashToolGroup([1, 2]);
    const { rerender } = renderGroup({ group, now: new Date() });
    expectToolDetailExpansion(["false", "true"]);

    const withNext = makeBashToolGroup([1, 2, 3]);
    rerender(groupCard({ group: withNext, now: new Date() }));
    expectToolDetailExpansion(["false", "false", "true"]);

    rerender(groupCard({ group: { ...withNext, status: "ended" }, now: new Date() }));
    expectToolDetailExpansion(["false", "false", "false"]);
  });

  it("keeps manually expanded commands open while streaming advances", () => {
    const group = makeBashToolGroup([1, 2]);
    const { rerender } = renderGroup({ group, now: new Date() });

    fireEvent.click(screen.getAllByRole("button", { name: /toggle tool details/i })[0]!);
    expectToolDetailExpansion(["true", "true"]);

    rerender(groupCard({ group: makeBashToolGroup([1, 2, 3]), now: new Date() }));

    expectToolDetailExpansion(["true", "false", "true"]);
  });

  it("opens a collapsed toolbox directly from a command preview row", () => {
    renderGroup({ group: makeBashToolGroup([1, 2], { status: "concluded" }), now: new Date() });

    fireEvent.click(screen.getByRole("button", { name: /open bash details: run shell command cmd1/i }));

    expectToolDetailExpansion(["true", "false"]);
  });

  it("re-opens the same command from its expandable row", () => {
    renderGroup({ group: makeBashToolGroup([1, 2], { status: "concluded" }), now: new Date() });

    fireEvent.click(screen.getByRole("button", { name: /open bash details: run shell command cmd1/i }));
    const firstToolToggle = screen.getAllByRole("button", { name: /toggle tool details/i })[0]!;
    fireEvent.click(firstToolToggle);
    expectToolDetailExpansion(["false", "false"]);

    fireEvent.click(firstToolToggle);

    expectToolDetailExpansion(["true", "false"]);
  });

  it("uses parsed English intros for known command preview rows", () => {
    const event = tool("Bash", "20260523T100002Z");
    const commandEvent: AnyEventRecord = {
      filename: event.filename,
      timestamp: event.timestamp,
      participant_id: event.participant_id,
      kind: "tool-use",
      payload: {
        tool_name: "Bash",
        tool_use_id: "x",
        input: { command: "cat src/a.ts src/b.ts src/c.ts" },
        success: true,
      },
    };
    renderGroup({
      group: makeGroup({
        status: "concluded",
        items: [commandEvent],
      }),
      now: new Date(),
    });

    expect(
      screen.getByText("Read file a.ts and 2 more", {
        selector: ".toolbox-preview-text",
      }),
    ).toBeInTheDocument();
  });

  it("shows only the expandable tool list while open, not a duplicate preview list", () => {
    renderGroup({ group: makeBashToolGroup([1, 2]), now: new Date() });

    expect(screen.queryByLabelText("Toolbox preview")).toBeNull();
    expectToolDetailExpansion(["false", "true"]);
  });

  it("wraps the open body in a .toolbox-collapse grid (padding-free clip) for the expand animation", () => {
    const { container } = renderGroup();
    expect(container.querySelector(".toolbox-collapse > .toolbox-clip > .toolbox-body")).not.toBeNull();
  });

  it("shows only the latest five toolbox items until older tools are revealed", () => {
    renderGroup({ group: makeBashToolGroup([1, 2, 3, 4, 5, 6, 7]), now: new Date() });

    const more = showOlderToolsButton();
    expect(more).toHaveTextContent("2 more tools");
    expect(document.querySelector(".toolbox-body")?.firstElementChild).toBe(more);
    expectCommandSummaryHidden(1);
    expectCommandSummaryHidden(2);
    expectCommandSummaryVisible(3);
    expectCommandSummaryVisible(7);

    fireEvent.click(more);

    expectNoOlderToolsButton();
    expectCommandSummaryVisible(1);
    expectCommandSummaryVisible(2);
  });
}

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyEventRecord } from "@f-mark/shared";
import { ProseCard } from "../../src/cards/ProseCard.js";
import { useStore } from "../../src/state/store.js";
import {
  PARTICIPANTS,
  makeProse,
  resetStore,
} from "./_helpers.js";

describe("ProseCard", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders title from name + markdown body in default rendered mode", () => {
    const ev = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      {
        name: "Launch Plan",
        content: "# Section\n\nA paragraph body.",
      },
    );
    const { container } = render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Launch Plan" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".prose-title-name")).not.toBeNull();
    // The markdown content should be rendered (not the source view).
    expect(container.querySelector("pre.fm-source")).toBeNull();
    expect(container.querySelector(".fm-prose")).not.toBeNull();
    expect(container.textContent).toContain("A paragraph body.");
    expect(container.querySelector(".prose-card.agent")).not.toBeNull();
  });

  test("clicking the accordion toggle switches between rendered and accordion modes", async () => {
    const user = userEvent.setup();
    const ev = makeProse(
      "20260522T120100Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Spec", content: "# Heading\n\nbody" },
    );
    const { container } = render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    // Default = rendered mode.
    expect(container.querySelector(".fm-prose")).not.toBeNull();
    expect(container.querySelector(".fm-accordion")).toBeNull();
    const accordionBtn = screen.getByRole("button", { name: /accordion view/i });
    await user.click(accordionBtn);
    expect(container.querySelector(".fm-accordion")).not.toBeNull();
    // Switch back via the rendered toggle.
    const renderedBtn = screen.getByRole("button", { name: /rendered view/i });
    await user.click(renderedBtn);
    expect(container.querySelector(".fm-accordion")).toBeNull();
    expect(container.querySelector(".fm-prose")).not.toBeNull();
  });

  test("accordion mode collapses composed blocks and titles folds from block content", async () => {
    const user = userEvent.setup();
    const anchor = makeProse(
      "20260522T120150Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Refactor Plan", content: "" },
    );
    const proseBlock = makeProse(
      "20260522T120151Z_ag-c92e.prose.md",
      "ag-c92e",
      {
        append_to: anchor.filename,
        content: "# First real section\n\nBody copy that starts collapsed.",
      },
    );
    const flowBlock: AnyEventRecord = {
      filename: "20260522T120152Z_ag-c92e.flow.json",
      timestamp: "20260522T120152Z",
      participant_id: "ag-c92e",
      kind: "flow",
      payload: {
        id: "flow-1",
        title: "Current docked slab -> Floating capsule",
        nodes: [],
        edges: [],
        append_to: anchor.filename,
      },
    };

    const { container } = render(
      <ProseCard
        event={anchor}
        participants={PARTICIPANTS}
        comments={[]}
        blocks={[proseBlock, flowBlock]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /accordion view/i }));

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button.fm-accordion-h1"),
    );
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
    ]);
    expect(screen.getByRole("button", { name: /First real section/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Current docked slab -> Floating capsule/,
      }),
    ).toBeInTheDocument();
    expect(container.querySelector(".fm-accordion-body")).toBeNull();
    expect(container.textContent).not.toContain("Section 1");
    expect(container.textContent).not.toContain("Flow chart 1");
    const chips = Array.from(container.querySelectorAll(".fm-accordion-icon-chip"));
    expect(chips).toHaveLength(2);
    expect(chips.map((chip) => chip.textContent)).toEqual(["", ""]);
  });

  test("comment with target on this event renders a line marker and click dispatches commentTarget", async () => {
    const user = userEvent.setup();
    const ev = makeProse(
      "20260522T120200Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "Line one\nLine two\nLine three" },
    );
    const comment = makeProse(
      "20260522T120300Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Pin me",
        append_to: ev.filename,
        mode: "comment",
        lines: [3, 3],
      },
    );
    const { container } = render(
      <ProseCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[comment]}
      />,
    );
    const pin = container.querySelector(".line-comment-marker.existing");
    expect(pin).not.toBeNull();
    expect(useStore.getState().commentTarget).toBeNull();
    await user.click(pin as Element);
    const target = useStore.getState().commentTarget;
    expect(target).not.toBeNull();
    expect(target).toMatchObject({ kind: "event", file: ev.filename });
    expect(target!.lines?.[0]).toBe(3);
    expect(useStore.getState().rightTab).toBe("comments");
  });

  test("line comment markers are sorted and visually separated without mutating comments", () => {
    const ev = makeProse(
      "20260522T120400Z_ag-c92e.prose.md",
      "ag-c92e",
      {
        name: "Close Pins",
        content: ["One", "Two", "Three", "Four", "Five"].join("\n"),
      },
    );
    const comments = [
      makeProse("20260522T120503Z_us-a7f3.prose.md", "us-a7f3", {
        content: "Fourth",
        append_to: ev.filename,
        mode: "comment",
        lines: [4, 4],
      }),
      makeProse("20260522T120501Z_us-a7f3.prose.md", "us-a7f3", {
        content: "Second",
        append_to: ev.filename,
        mode: "comment",
        lines: [2, 2],
      }),
      makeProse("20260522T120502Z_us-a7f3.prose.md", "us-a7f3", {
        content: "Third",
        append_to: ev.filename,
        mode: "comment",
        lines: [3, 3],
      }),
    ];
    const originalOrder = comments.map((comment) => comment.filename);

    const { container } = render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={comments} />,
    );

    expect(comments.map((comment) => comment.filename)).toEqual(originalOrder);
    const anchors = Array.from(
      container.querySelectorAll<HTMLElement>(".line-comment-anchor.existing"),
    );
    expect(anchors.map((anchor) => anchor.dataset.targetLines)).toEqual([
      "2:2",
      "3:3",
      "4:4",
    ]);
    const centers = anchors.map((anchor) => {
      const top = Number.parseFloat(anchor.style.top);
      const iconTop = Number.parseFloat(
        anchor.style.getPropertyValue("--icon-top"),
      );
      return top + iconTop;
    });
    expect(centers[1]! - centers[0]!).toBeGreaterThanOrEqual(34);
    expect(centers[2]! - centers[1]!).toBeGreaterThanOrEqual(34);
  });
});

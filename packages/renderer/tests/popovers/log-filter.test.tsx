/* Phase 12 — LogFilterPopover unit tests. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { LogFilterPopover } from "../../src/popovers/LogFilterPopover.js";
import {
  DEFAULT_FILTER,
  applyFilter,
  type LogFilter,
} from "../../src/popovers/log-filter-types.js";

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

function rect(): DOMRect {
  return {
    x: 100,
    y: 100,
    top: 100,
    left: 100,
    right: 200,
    bottom: 130,
    width: 100,
    height: 30,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

describe("LogFilterPopover — rendering", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders all four sections + the footer", () => {
    render(
      <LogFilterPopover
        anchorRect={rect()}
        initial={DEFAULT_FILTER}
        participants={PARTICIPANTS}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );
    // section labels
    expect(screen.getByText("Kinds")).toBeInTheDocument();
    expect(screen.getByText("Participants")).toBeInTheDocument();
    expect(screen.getByText("Date range")).toBeInTheDocument();
    expect(screen.getByText("Named only")).toBeInTheDocument();
    // footer buttons
    expect(screen.getByRole("button", { name: /Reset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply/i })).toBeInTheDocument();
  });

  test("renders a chip per filterable kind and per participant", () => {
    render(
      <LogFilterPopover
        anchorRect={rect()}
        initial={DEFAULT_FILTER}
        participants={PARTICIPANTS}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );
    const kindsGroup = screen.getByRole("group", { name: "Filter by kind" });
    // 8 filterable kinds
    expect(within(kindsGroup).getByRole("checkbox", { name: "prose" })).toBeInTheDocument();
    expect(within(kindsGroup).getByRole("checkbox", { name: "choices" })).toBeInTheDocument();
    expect(within(kindsGroup).getByRole("checkbox", { name: "choice" })).toBeInTheDocument();
    expect(within(kindsGroup).getByRole("checkbox", { name: "turn-end" })).toBeInTheDocument();
    expect(within(kindsGroup).getByRole("checkbox", { name: "todo" })).toBeInTheDocument();
    expect(within(kindsGroup).getByRole("checkbox", { name: "html" })).toBeInTheDocument();
    expect(within(kindsGroup).getByRole("checkbox", { name: "file" })).toBeInTheDocument();
    expect(within(kindsGroup).getByRole("checkbox", { name: "tool-use" })).toBeInTheDocument();

    const partGroup = screen.getByRole("group", {
      name: "Filter by participant",
    });
    expect(within(partGroup).getByRole("checkbox", { name: "Roey" })).toBeInTheDocument();
    expect(within(partGroup).getByRole("checkbox", { name: "Claude" })).toBeInTheDocument();
  });
});

describe("LogFilterPopover — interactions", () => {
  let onApply: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onApply = vi.fn();
    onClose = vi.fn();
  });
  afterEach(() => {
    cleanup();
  });

  test("clicking a kind chip toggles it on, then Apply emits the filter", async () => {
    const user = userEvent.setup();
    render(
      <LogFilterPopover
        anchorRect={rect()}
        initial={DEFAULT_FILTER}
        participants={PARTICIPANTS}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    const proseChip = screen.getByRole("checkbox", { name: "prose" });
    expect(proseChip).toHaveAttribute("aria-checked", "false");
    await user.click(proseChip);
    expect(proseChip).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: /Apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const emitted = onApply.mock.calls[0]![0] as LogFilter;
    expect(emitted.kinds).toEqual(["prose"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("toggling Named only and a date range, then Apply, emits both", async () => {
    const user = userEvent.setup();
    render(
      <LogFilterPopover
        anchorRect={rect()}
        initial={DEFAULT_FILTER}
        participants={PARTICIPANTS}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByLabelText(/Named only/i));
    await user.click(screen.getByRole("button", { name: "Last 7d" }));
    await user.click(screen.getByRole("button", { name: /Apply/i }));
    const emitted = onApply.mock.calls[0]![0] as LogFilter;
    expect(emitted.namedOnly).toBe(true);
    expect(emitted.range).toBe("7d");
  });

  test("Custom range reveals two datetime-local inputs", async () => {
    const user = userEvent.setup();
    render(
      <LogFilterPopover
        anchorRect={rect()}
        initial={DEFAULT_FILTER}
        participants={PARTICIPANTS}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    expect(screen.queryByLabelText("Custom start")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByLabelText("Custom start")).toBeInTheDocument();
    expect(screen.getByLabelText("Custom end")).toBeInTheDocument();
  });

  test("Reset returns the draft to DEFAULT_FILTER", async () => {
    const user = userEvent.setup();
    const initial: LogFilter = {
      ...DEFAULT_FILTER,
      kinds: ["prose", "todo"],
      namedOnly: true,
      range: "today",
    };
    render(
      <LogFilterPopover
        anchorRect={rect()}
        initial={initial}
        participants={PARTICIPANTS}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    // Initial state: prose chip should be on.
    expect(
      screen.getByRole("checkbox", { name: "prose" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(
      screen.getByRole("checkbox", { name: "prose" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText(/Named only/i)).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: /Apply/i }));
    const emitted = onApply.mock.calls[0]![0] as LogFilter;
    expect(emitted).toEqual(DEFAULT_FILTER);
  });

  test("clicking the backdrop calls onClose", async () => {
    const user = userEvent.setup();
    render(
      <LogFilterPopover
        anchorRect={rect()}
        initial={DEFAULT_FILTER}
        participants={PARTICIPANTS}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByTestId("popover-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  test("pressing Escape calls onClose", async () => {
    const user = userEvent.setup();
    render(
      <LogFilterPopover
        anchorRect={rect()}
        initial={DEFAULT_FILTER}
        participants={PARTICIPANTS}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("applyFilter — pure helper", () => {
  function makeProse(
    filename: string,
    participant: string,
    extra: Record<string, unknown> = {},
  ): AnyEventRecord {
    return {
      filename,
      timestamp: filename.split("_")[0]!,
      participant_id: participant,
      kind: "prose",
      payload: { content: "x", ...extra },
    };
  }
  function makeTodo(filename: string, participant: string): AnyEventRecord {
    return {
      filename,
      timestamp: filename.split("_")[0]!,
      participant_id: participant,
      kind: "todo",
      payload: { id: "t1", title: "x", status: "open" },
    };
  }

  test("kind filter keeps only matching kinds", () => {
    const events = [
      makeProse("20260522T100000Z_us.prose.md", "us-a7f3"),
      makeTodo("20260522T100100Z_us.todo.json", "us-a7f3"),
    ];
    const out = applyFilter(events, { ...DEFAULT_FILTER, kinds: ["prose"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("prose");
  });

  test("participant filter keeps only matching participants", () => {
    const events = [
      makeProse("20260522T100000Z_us.prose.md", "us-a7f3"),
      makeProse("20260522T100100Z_ag.prose.md", "ag-c92e"),
    ];
    const out = applyFilter(events, {
      ...DEFAULT_FILTER,
      participants: ["us-a7f3"],
    });
    expect(out.map((e) => e.participant_id)).toEqual(["us-a7f3"]);
  });

  test("namedOnly keeps only named prose", () => {
    const events = [
      makeProse("20260522T100000Z_us.prose.md", "us-a7f3"),
      makeProse("20260522T100100Z_us.prose.md", "us-a7f3", {
        name: "Spec",
      }),
      makeTodo("20260522T100200Z_us.todo.json", "us-a7f3"),
    ];
    const out = applyFilter(events, { ...DEFAULT_FILTER, namedOnly: true });
    expect(out).toHaveLength(1);
    expect((out[0]!.payload as { name: string }).name).toBe("Spec");
  });

  test("date range 'today' drops events from yesterday", () => {
    const now = new Date("2026-05-22T12:00:00Z");
    const events = [
      makeProse("20260521T235959Z_us.prose.md", "us-a7f3"),
      makeProse("20260522T100000Z_us.prose.md", "us-a7f3"),
    ];
    const out = applyFilter(events, { ...DEFAULT_FILTER, range: "today" }, now);
    expect(out.map((e) => e.filename)).toEqual([
      "20260522T100000Z_us.prose.md",
    ]);
  });
});

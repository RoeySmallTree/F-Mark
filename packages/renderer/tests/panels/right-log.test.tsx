/* Phase 12 — RightLog integration tests. Covers the redesigned row layout
   (fixed columns, dot+initial identity cell, time, kind tag w/ icon,
   summary, hover chevron), chronological sort, filter application via the
   active-chip remove path, and the scroll-to-event behavior. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RightLog } from "../../src/panels/right/RightLog.js";
import { useStore } from "../../src/state/store.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import {
  makeChoices,
  makeProse,
  makeTodo,
  makeTurnEnd,
  resetStore,
} from "../cards/_helpers.js";

function setEvents(events: ReturnType<typeof useStore.getState>["events"]): void {
  act(() => {
    useStore.setState({ events });
  });
}

describe("RightLog — base rendering", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders the ordering subhead + Filter button", () => {
    const { container } = render(<RightLog />);
    const scope = container.querySelector(".log-head .scope");
    expect(scope).not.toBeNull();
    expect(scope!.textContent).toContain("oldest first");
    expect(
      screen.getByRole("button", { name: /Filter/i }),
    ).toBeInTheDocument();
  });

  test("renders empty-state when there are no events", () => {
    render(<RightLog />);
    expect(
      screen.getByText(/No events yet/i),
    ).toBeInTheDocument();
  });

  test("lists events oldest-first (chronological top-to-bottom)", () => {
    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "first" },
      ),
      makeTodo("20260522T100100Z_us-a7f3.todo.json", "us-a7f3", {
        id: "t",
        title: "do",
        status: "open",
      }),
      makeTurnEnd("20260522T100200Z_us-a7f3.turn-end.json", "us-a7f3"),
    ]);
    render(<RightLog />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute("data-event-kind")).toBe("prose");
    expect(rows[1]!.getAttribute("data-event-kind")).toBe("todo");
    expect(rows[2]!.getAttribute("data-event-kind")).toBe("turn-end");
  });

  test("each row renders identity avatar as the first cell, time second, kind tag third", () => {
    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "hello" },
      ),
    ]);
    render(<RightLog />);
    const [row] = screen.getAllByRole("listitem");
    const cells = row!.children;
    /* The grid children, in document order: identity, time, kind-tag,
       summary, jump chevron. */
    expect(cells[0]!.classList.contains("log-who")).toBe(true);
    expect(cells[0]!.querySelector(".avatar .avatar-art-glyph")).not.toBeNull();
    expect(cells[1]!.classList.contains("ts")).toBe(true);
    expect(cells[2]!.classList.contains("kind-tag")).toBe(true);
    expect(cells[2]!.getAttribute("data-kind")).toBe("prose");
    /* The kind tag includes a lucide icon + a label. */
    expect(cells[2]!.querySelector("svg")).not.toBeNull();
    expect(cells[2]!.querySelector(".kind-tag-label")?.textContent).toBe(
      "prose",
    );
    expect(cells[3]!.classList.contains("summary")).toBe(true);
  });

  test("renders a long prose summary in full — no JS length cap, no ellipsis", () => {
    const longText =
      "This is a deliberately long prose message that comfortably exceeds " +
      "the sixty-character cap the activity log used to enforce, so it must " +
      "render in full and wrap rather than being sliced with an ellipsis.";
    setEvents([
      makeProse("20260522T100000Z_us-a7f3.prose.md", "us-a7f3", {
        content: longText,
      }),
    ]);
    render(<RightLog />);
    const [row] = screen.getAllByRole("listitem");
    const summary = row!.querySelector(".summary");
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toBe(longText);
    expect(summary!.textContent).not.toContain("…");
  });

  test("renders a long choices question in full — no JS length cap, no ellipsis", () => {
    const longQuestion =
      "Which of these many carefully considered options would you like to " +
      "proceed with, given that the question itself runs well past sixty " +
      "characters and should no longer be truncated in the activity log?";
    setEvents([
      makeChoices("20260522T100000Z_us-a7f3.choices.json", "us-a7f3", {
        id: "q1",
        question: longQuestion,
        options: [{ id: "a", label: "A" }],
        multi: false,
      }),
    ]);
    render(<RightLog />);
    const [row] = screen.getAllByRole("listitem");
    const summary = row!.querySelector(".summary");
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain(longQuestion);
    expect(summary!.textContent).not.toContain("…");
  });

  test("user vs agent dot color is signaled via .log-who.user / .log-who.agent", () => {
    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "u" },
      ),
      makeProse(
        "20260522T100100Z_ag-c92e.prose.md",
        "ag-c92e",
        { content: "a" },
      ),
    ]);
    render(<RightLog />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]!.querySelector(".log-who")?.classList.contains("user")).toBe(
      true,
    );
    expect(rows[1]!.querySelector(".log-who")?.classList.contains("agent")).toBe(
      true,
    );
  });
});

describe("RightLog — Filter button + popover", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("clicking Filter opens the LogFilterPopover via the store", async () => {
    const user = userEvent.setup();
    render(<RightLog />);
    expect(screen.queryByLabelText("Filter activity log")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Filter/i }));
    expect(useStore.getState().activePopover.key).toBe("log-filter");
    expect(screen.getByLabelText("Filter activity log")).toBeInTheDocument();
  });

  test("Apply with kinds:['prose'] narrows the visible rows to prose only", async () => {
    const user = userEvent.setup();
    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "hello" },
      ),
      makeTodo("20260522T100100Z_us-a7f3.todo.json", "us-a7f3", {
        id: "t",
        title: "do",
        status: "open",
      }),
    ]);
    render(<RightLog />);
    await user.click(screen.getByRole("button", { name: /Filter/i }));
    const proseChip = await screen.findByRole("checkbox", { name: "prose" });
    await user.click(proseChip);
    await user.click(screen.getByRole("button", { name: /Apply/i }));
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute("data-event-kind")).toBe("prose");
  });
});

describe("RightLog — filter behavior", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("namedOnly filter shows only named prose", async () => {
    const user = userEvent.setup();
    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "an unnamed message" },
      ),
      makeProse(
        "20260522T100100Z_us-a7f3.prose.md",
        "us-a7f3",
        { name: "Launch Plan", content: "..." },
      ),
    ]);
    render(<RightLog />);
    await user.click(screen.getByRole("button", { name: /Filter/i }));
    await user.click(screen.getByLabelText(/Named only/i));
    await user.click(screen.getByRole("button", { name: /Apply/i }));
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute("data-event-filename")).toBe(
      "20260522T100100Z_us-a7f3.prose.md",
    );
  });

  test("active chips render and clicking one removes that filter", async () => {
    const user = userEvent.setup();
    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "hello" },
      ),
      makeTodo("20260522T100100Z_us-a7f3.todo.json", "us-a7f3", {
        id: "t",
        title: "do",
        status: "open",
      }),
    ]);
    render(<RightLog />);
    await user.click(screen.getByRole("button", { name: /Filter/i }));
    await user.click(
      await screen.findByRole("checkbox", { name: "prose" }),
    );
    await user.click(screen.getByRole("button", { name: /Apply/i }));
    /* Initial: filter narrows to prose only. */
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    /* Click the prose chip in active-chips to remove it. */
    const chips = screen.getByTestId("active-chips");
    const proseChip = within(chips).getByRole("button", { name: /prose/i });
    await user.click(proseChip);
    /* Now both events should be back. */
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("clear-all wipes every active filter at once", async () => {
    const user = userEvent.setup();
    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "hello" },
      ),
      makeTodo("20260522T100100Z_us-a7f3.todo.json", "us-a7f3", {
        id: "t",
        title: "do",
        status: "open",
      }),
    ]);
    /* Pre-seed two active filter dimensions to exercise the wipe. */
    act(() => {
      useStore.setState({
        logFilter: {
          ...DEFAULT_FILTER,
          kinds: ["prose"],
          namedOnly: true,
        },
      });
    });
    render(<RightLog />);
    expect(screen.getByTestId("active-chips")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Clear all filters/i }));
    expect(useStore.getState().logFilter).toEqual(DEFAULT_FILTER);
  });

  test("filter survives a Right-panel tab switch (i.e. RightLog remount)", async () => {
    const user = userEvent.setup();
    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "hello" },
      ),
      makeTodo("20260522T100100Z_us-a7f3.todo.json", "us-a7f3", {
        id: "t",
        title: "do",
        status: "open",
      }),
    ]);
    const { unmount } = render(<RightLog />);
    await user.click(screen.getByRole("button", { name: /Filter/i }));
    await user.click(await screen.findByRole("checkbox", { name: "prose" }));
    await user.click(screen.getByRole("button", { name: /Apply/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    /* Simulate a tab switch by unmounting RightLog completely, then
       remounting. The applied filter must survive because it lives in the
       global store, not in component-local state. */
    unmount();
    render(<RightLog />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByTestId("active-chips")).toBeInTheDocument();
  });

  test("Filter button toggles the popover: second click closes it", async () => {
    const user = userEvent.setup();
    render(<RightLog />);
    const btn = screen.getByRole("button", { name: /Filter/i });
    await user.click(btn);
    expect(useStore.getState().activePopover.key).toBe("log-filter");
    await user.click(btn);
    expect(useStore.getState().activePopover.key).toBeNull();
  });

  test("clicking a log row scroll-jumps to the matching feed card", async () => {
    const user = userEvent.setup();
    /* Inject a feed card with the same data-event-filename. */
    const feedHost = document.createElement("div");
    feedHost.setAttribute(
      "data-event-filename",
      "20260522T100000Z_us-a7f3.prose.md",
    );
    document.body.appendChild(feedHost);
    /* jsdom does not implement scrollIntoView; attach a stub then spy on it. */
    const scrollFn = vi.fn();
    const originalScroll = (
      HTMLElement.prototype as unknown as { scrollIntoView?: unknown }
    ).scrollIntoView;
    (HTMLElement.prototype as unknown as { scrollIntoView: typeof scrollFn })
      .scrollIntoView = scrollFn;

    setEvents([
      makeProse(
        "20260522T100000Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "hello" },
      ),
    ]);
    render(<RightLog />);
    const [row] = screen.getAllByRole("listitem");
    await user.click(row!);
    expect(scrollFn).toHaveBeenCalled();
    /* Cleanup. */
    if (originalScroll === undefined) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)
        .scrollIntoView;
    } else {
      (HTMLElement.prototype as unknown as { scrollIntoView: unknown })
        .scrollIntoView = originalScroll;
    }
    document.body.removeChild(feedHost);
  });
});

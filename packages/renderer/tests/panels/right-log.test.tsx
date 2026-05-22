/* Phase 12 — RightLog integration tests. Covers filter application via the
   active-chip remove path and the scroll-to-event behavior. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RightLog } from "../../src/panels/right/RightLog.js";
import { useStore } from "../../src/state/store.js";
import {
  PARTICIPANTS,
  SESSION_META,
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

  test("renders the scope subhead + Filter button", () => {
    const { container } = render(<RightLog />);
    const scope = container.querySelector(".log-head .scope");
    expect(scope).not.toBeNull();
    expect(scope!.textContent).toContain("launch-planning");
    expect(scope!.textContent).toContain("newest first");
    expect(
      screen.getByRole("button", { name: /Filter/i }),
    ).toBeInTheDocument();
  });

  test("renders empty-state when there are no events", () => {
    render(<RightLog />);
    expect(
      screen.getByText(/No events in this session\./i),
    ).toBeInTheDocument();
  });

  test("lists events newest-first", () => {
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
    expect(rows[0]!.getAttribute("data-event-kind")).toBe("turn-end");
    expect(rows[1]!.getAttribute("data-event-kind")).toBe("todo");
    expect(rows[2]!.getAttribute("data-event-kind")).toBe("prose");
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
    // Initial: filter narrows to prose only.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    // Click the prose chip in active-chips to remove it.
    const chips = screen.getByTestId("active-chips");
    const proseChip = within(chips).getByRole("button", { name: /prose/i });
    await user.click(proseChip);
    // Now both events should be back.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("clicking a log row scroll-jumps to the matching feed card", async () => {
    const user = userEvent.setup();
    // Inject a feed card with the same data-event-filename.
    const feedHost = document.createElement("div");
    feedHost.setAttribute(
      "data-event-filename",
      "20260522T100000Z_us-a7f3.prose.md",
    );
    document.body.appendChild(feedHost);
    // jsdom does not implement scrollIntoView; attach a stub then spy on it.
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
    // Cleanup.
    if (originalScroll === undefined) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)
        .scrollIntoView;
    } else {
      (HTMLElement.prototype as unknown as { scrollIntoView: unknown })
        .scrollIntoView = originalScroll;
    }
    document.body.removeChild(feedHost);
  });

  // Sanity: session metadata in the scope subhead resolves the active slug.
  test("scope subhead uses the current session's slug", () => {
    const { container } = render(<RightLog />);
    const scope = container.querySelector(".log-head .scope");
    expect(scope?.textContent ?? "").toContain(SESSION_META.slug);
  });
});

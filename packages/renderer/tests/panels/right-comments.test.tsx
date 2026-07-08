import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RightComments } from "../../src/panels/right/RightComments.js";
import { useStore } from "../../src/state/store.js";
import { makeProse, resetStore } from "../cards/_helpers.js";

function installRafQueue(): () => void {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    nextId += 1;
    callbacks.set(nextId, cb);
    return nextId;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });
  return (): void => {
    const pending = [...callbacks.entries()];
    callbacks.clear();
    for (const [, cb] of pending) cb(0);
  };
}

function appendScrollHarness(targetFilename: string): {
  panel: HTMLElement;
  feedScrollBy: ReturnType<typeof vi.fn>;
  panelScrollTo: ReturnType<typeof vi.fn>;
} {
  const feed = document.createElement("div");
  feed.className = "feed-scroll";
  const target = document.createElement("article");
  target.dataset.eventFilename = targetFilename;
  const content = document.createElement("div");
  content.className = "commentable-content";
  target.append(content);
  feed.append(target);
  const feedScrollBy = vi.fn();
  Object.defineProperty(feed, "scrollBy", {
    configurable: true,
    value: feedScrollBy,
  });
  document.body.append(feed);

  const panel = document.createElement("div");
  panel.className = "panel-scroll";
  Object.defineProperty(panel, "clientHeight", {
    configurable: true,
    value: 260,
  });
  const panelScrollTo = vi.fn();
  Object.defineProperty(panel, "scrollTo", {
    configurable: true,
    value: panelScrollTo,
  });
  document.body.append(panel);

  return { panel, feedScrollBy, panelScrollTo };
}

describe("RightComments", () => {
  beforeEach(() => {
    resetStore({ rightTab: "log" });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  test("shows an empty state instead of a perpetual loader", () => {
    useStore.setState({ events: [] });

    render(<RightComments />);

    expect(screen.getByText(/No comments yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  test("renders list-only comments without the anchored layout toggle", () => {
    const target = makeProse(
      "20260522T121000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Anchor", content: "Line 1" },
    );
    const first = makeProse(
      "20260522T121100Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "Comment", append_to: target.filename, mode: "comment", lines: [1, 1] },
    );
    useStore.setState({ events: [target, first] });

    render(<RightComments />);

    expect(screen.queryByLabelText(/Thread layout mode/i)).toBeNull();
    expect(document.querySelector(".right-comments.list")).not.toBeNull();
  });

  test("folded thread card surfaces its participants and latest activity", () => {
    const target = makeProse("20260522T121000Z_ag-c92e.prose.md", "ag-c92e", {
      name: "Anchor",
      content: "Line 1",
    });
    const root = makeProse("20260522T121100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "why",
      append_to: target.filename,
      mode: "comment",
      lines: [1, 1],
    });
    const reply = makeProse("20260522T121200Z_ag-c92e.prose.md", "ag-c92e", {
      content: "the latest answer",
      append_to: target.filename,
      mode: "comment",
      lines: [1, 1],
      in_reply_to: root.filename,
    });
    useStore.setState({ events: [target, root, reply] });

    render(<RightComments />);

    // The participant stack names both people (a11y), not just a count.
    const stack = screen.getByLabelText(/^participants:/i);
    const label = stack.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/claude/i);
    expect(label.split(",")).toHaveLength(2);
    // The preview reflects the *latest* message, flagged as a reply.
    const latest = document.querySelector(".right-comment-fold-latest");
    expect(latest).toHaveTextContent("the latest answer");
    expect(latest).toHaveTextContent(/latest/i);
  });

  test("renders selected comment body as markdown", async () => {
    const user = userEvent.setup();
    const target = makeProse(
      "20260522T121000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Anchor", content: "Line 1" },
    );
    const first = makeProse(
      "20260522T121100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "**bold note**\n\n- item",
        append_to: target.filename,
        mode: "comment",
        lines: [1, 1],
      },
    );
    useStore.setState({ events: [target, first] });

    render(<RightComments />);
    await user.click(
      screen.getByText(/line 1/i, {
        selector: ".right-comments-thread-head span",
      }),
    );

    expect(screen.getByText("bold note").tagName).toBe("STRONG");
    expect(screen.getByText("item").tagName).toBe("LI");
  });

  test("clicking a thread focuses its target and schedules panel/feed alignment", async () => {
    const flushRaf = installRafQueue();
    const user = userEvent.setup();
    const target = makeProse(
      "20260522T121000Z_ag-c92e.prose.md",
      "ag-c92e",
      {
        name: "Anchor",
        content: Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join(
          "\n",
        ),
      },
    );
    const first = makeProse(
      "20260522T121100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Near the top",
        append_to: target.filename, mode: "comment", lines: [1, 1],
      },
    );
    const second = makeProse(
      "20260522T121200Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Lower down",
        append_to: target.filename, mode: "comment", lines: [9, 9],
      },
    );
    useStore.setState({ events: [target, first, second] });
    const { panel, feedScrollBy, panelScrollTo } = appendScrollHarness(
      target.filename,
    );
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(<RightComments />, { container: panel });
    await user.click(
      screen.getByText(/line 9/i, {
        selector: ".right-comments-thread-head span",
      }),
    );
    await act(async () => {
      flushRaf();
    });
    await act(async () => {
      flushRaf();
    });
    await act(async () => {
      flushRaf();
    });

    expect(useStore.getState().commentTarget).toEqual({
      kind: "event",
      file: target.filename,
      lines: [9, 9],
    });
    expect(useStore.getState().rightTab).toBe("comments");
    await waitFor(() => expect(panelScrollTo).toHaveBeenCalled());
    expect(feedScrollBy).toHaveBeenCalled();

    act(() => {
      useStore.setState({ focusedCommentId: second.filename });
    });
    await act(async () => {
      flushRaf();
    });
    await act(async () => {
      flushRaf();
    });
    expect(scrollIntoView).toHaveBeenCalled();
    expect(useStore.getState().focusedCommentId).toBeNull();
  });
});

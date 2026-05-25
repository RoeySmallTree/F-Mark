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
        target: { file: target.filename, lines: [1, 1] },
      },
    );
    const second = makeProse(
      "20260522T121200Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Lower down",
        target: { file: target.filename, lines: [9, 9] },
      },
    );
    useStore.setState({ events: [target, first, second] });
    const { panel, feedScrollBy, panelScrollTo } = appendScrollHarness(
      target.filename,
    );

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
      file: target.filename,
      lines: [9, 9],
    });
    expect(useStore.getState().rightTab).toBe("comments");
    await waitFor(() => expect(panelScrollTo).toHaveBeenCalled());
    expect(feedScrollBy).toHaveBeenCalled();
  });
});

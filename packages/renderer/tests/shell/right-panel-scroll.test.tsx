import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type JSX } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useStore } from "../../src/state/store.js";
import { useRightPanelScroll } from "../../src/shell/rightPanel/useRightPanelScroll.js";
import type { RightPanelActivePane } from "../../src/shell/rightPanel/useRightPanelDockController.js";
import { resetStore, SESSION_META } from "../cards/_helpers.js";

const SID = SESSION_META.id;

afterEach(() => {
  cleanup();
});

describe("right panel scroll persistence", () => {
  test("setRightScroll remembers each pane's scroll independently (no cross-pane clobber)", () => {
    resetStore({ rightScrollBySession: {} });

    const { setRightScroll } = useStore.getState();
    setRightScroll("comments", 300);
    setRightScroll("log", 50);

    // Every right-panel pane shares one scroll container. If the position is
    // stored only per session, log's 50 overwrites comments' 300 and returning
    // to comments jumps to top. Keyed per (session, pane), both survive.
    const map = useStore.getState().rightScrollBySession;
    expect(Object.keys(map)).toHaveLength(2);
    expect(Object.values(map)).toEqual(expect.arrayContaining([300, 50]));
  });

  test("useRightPanelScroll saves scroll under the active pane", async () => {
    const setRightScroll = vi.fn();
    function Harness(): JSX.Element {
      const { onPanelScroll, scrollRef } = useRightPanelScroll(
        SID,
        "comments",
        {},
        setRightScroll,
      );
      return <div data-testid="p" ref={scrollRef} onScroll={onPanelScroll} />;
    }
    render(<Harness />);
    const el = screen.getByTestId("p");
    Object.defineProperty(el, "scrollTop", { configurable: true, value: 300 });

    fireEvent.scroll(el);

    await waitFor(() =>
      expect(setRightScroll).toHaveBeenCalledWith("comments", 300),
    );
  });

  test("useRightPanelScroll restores each pane's own saved scroll", () => {
    // Keyed by (session, pane): comments and log hold distinct positions.
    const scrollMap: Record<string, number> = {
      [SID + "::comments"]: 300,
      [SID + "::log"]: 50,
    };
    function Harness({ pane }: { pane: RightPanelActivePane }): JSX.Element {
      const { scrollRef, onPanelScroll } = useRightPanelScroll(
        SID,
        pane,
        scrollMap,
        vi.fn(),
      );
      return <div data-testid="p" ref={scrollRef} onScroll={onPanelScroll} />;
    }
    const { rerender } = render(<Harness pane="log" />);
    const node = screen.getByTestId("p");
    // jsdom has no layout, so give the node a real scrollTop to observe.
    let top = 0;
    Object.defineProperty(node, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = v;
      },
    });

    rerender(<Harness pane="comments" />);

    expect(node.scrollTop).toBe(300);
  });
});

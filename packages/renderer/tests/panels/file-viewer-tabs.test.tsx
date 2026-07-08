import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TabsRow } from "../../src/panels/fileViewer/TabsRow.js";
import { useStore } from "../../src/state/store.js";

const SID = "session-1";
const TARGET = "/project/src/target.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useStore.setState({
    currentSessionId: null,
    fileViewerTabsBySession: {},
    fileViewerActiveBySession: {},
  });
});

describe("TabsRow", () => {
  test("pinning a file tab scrolls that tab into view after reordering", async () => {
    const scrollIntoView = vi.fn();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(
      scrollIntoView,
    );
    useStore.setState({
      currentSessionId: SID,
      fileViewerTabsBySession: {
        [SID]: [
          { path: "/project/src/a.ts", pinned: false },
          { path: "/project/src/b.ts", pinned: false },
          { path: TARGET, pinned: false },
        ],
      },
      fileViewerActiveBySession: { [SID]: TARGET },
    });

    render(<TabsRow />);
    scrollIntoView.mockClear();

    await userEvent.click(screen.getAllByRole("button", { name: "Pin tab" })[2]!);

    expect(useStore.getState().fileViewerTabsBySession[SID]?.[2]?.pinned).toBe(
      true,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: "nearest",
      block: "nearest",
    });
  });
});

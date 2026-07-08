/* DiffModeToggle — the diff MODE control in the FileViewer chrome (design
   §8.3). Verifies the menu switches the per-tab store slice, the gear opens
   git-diff settings, and the control disables on a non-git root. The
   inline/side-by-side STYLE toggle moved out to DiffStyleToggle (covered by
   diff-style-toggle.test.tsx). */

import { afterEach, describe, it, expect, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffModeToggle } from "../../src/panels/fileViewer/DiffModeToggle.js";
import {
  useStore,
  DEFAULT_FILE_VIEWER_DIFF,
} from "../../src/state/store.js";

beforeEach(() => {
  useStore.setState({
    currentSessionId: "s1",
    fileViewerActiveBySession: { s1: "/root/a.ts" },
    fileViewerDiffBySession: {},
    activeModal: null,
    settingsSection: "profile",
  });
});

afterEach(cleanup);

describe("DiffModeToggle", () => {
  it("renders nothing when no file is active", () => {
    useStore.setState({ fileViewerActiveBySession: {} });
    const { container } = render(<DiffModeToggle />);
    expect(container.firstChild).toBeNull();
  });

  it("switches the diff mode in the store", async () => {
    const user = userEvent.setup();
    render(<DiffModeToggle />);
    await user.click(screen.getByTestId("diff-mode-button"));
    await user.click(screen.getByTestId("diff-mode-whole-branch"));
    expect(
      useStore.getState().fileViewerDiffBySession["s1"]?.["/root/a.ts"]?.mode,
    ).toBe("whole-branch");
  });

  it("no longer renders the style buttons in its dropdown", async () => {
    const user = userEvent.setup();
    render(<DiffModeToggle />);
    await user.click(screen.getByTestId("diff-mode-button"));
    /* Style moved to the separate DiffStyleToggle beside the dropdown. */
    expect(screen.queryByTestId("diff-style-inline")).toBeNull();
    expect(screen.queryByTestId("diff-style-side-by-side")).toBeNull();
  });

  it("defaults reflect current-session + side-by-side", () => {
    expect(DEFAULT_FILE_VIEWER_DIFF.mode).toBe("current-session");
    expect(DEFAULT_FILE_VIEWER_DIFF.style).toBe("side-by-side");
    expect(DEFAULT_FILE_VIEWER_DIFF.baseRef).toBeNull();
  });

  it("gear opens the git-diff settings section", async () => {
    const user = userEvent.setup();
    render(<DiffModeToggle />);
    await user.click(screen.getByTestId("diff-mode-button"));
    await user.click(screen.getByTestId("diff-settings-gear"));
    expect(useStore.getState().activeModal).toBe("settings");
    expect(useStore.getState().settingsSection).toBe("git-diff");
  });

  it("disables on a non-git root", () => {
    render(<DiffModeToggle disabled />);
    expect(screen.getByTestId("diff-mode-button")).toBeDisabled();
  });
});

/* DiffStyleToggle — the icon-only inline ⇄ side-by-side control that now sits
   BESIDE the diff selector (it used to be a row inside the DiffModeToggle
   dropdown). Verifies it reflects + writes the per-tab style and renders
   nothing without an active file. */

import { afterEach, describe, it, expect, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffStyleToggle } from "../../src/panels/fileViewer/DiffStyleToggle.js";
import { useStore } from "../../src/state/store.js";

beforeEach(() => {
  useStore.setState({
    currentSessionId: "s1",
    fileViewerActiveBySession: { s1: "/root/a.ts" },
    fileViewerDiffBySession: {},
  });
});

afterEach(cleanup);

describe("DiffStyleToggle", () => {
  it("renders nothing when no file is active", () => {
    useStore.setState({ fileViewerActiveBySession: {} });
    const { container } = render(<DiffStyleToggle />);
    expect(container.firstChild).toBeNull();
  });

  it("renders two icon-only buttons (no text labels)", () => {
    render(<DiffStyleToggle />);
    const inline = screen.getByTestId("diff-style-inline");
    const split = screen.getByTestId("diff-style-side-by-side");
    expect(inline.textContent).toBe("");
    expect(split.textContent).toBe("");
    /* Accessible names come from aria-label, not visible text. */
    expect(inline.getAttribute("aria-label")).toBe("Inline diff");
    expect(split.getAttribute("aria-label")).toBe("Side-by-side diff");
  });

  it("reflects the default (side-by-side) as pressed", () => {
    render(<DiffStyleToggle />);
    expect(
      screen.getByTestId("diff-style-side-by-side").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("diff-style-inline").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("writes the chosen style to the per-tab store slice", async () => {
    const user = userEvent.setup();
    render(<DiffStyleToggle />);
    await user.click(screen.getByTestId("diff-style-inline"));
    expect(
      useStore.getState().fileViewerDiffBySession["s1"]?.["/root/a.ts"]?.style,
    ).toBe("inline");
    await user.click(screen.getByTestId("diff-style-side-by-side"));
    expect(
      useStore.getState().fileViewerDiffBySession["s1"]?.["/root/a.ts"]?.style,
    ).toBe("side-by-side");
  });
});

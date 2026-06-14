import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmbedCard } from "../../src/cards/EmbedCard.js";
import { useStore } from "../../src/state/store.js";
import { PARTICIPANTS, makeHtml, resetStore } from "./_helpers.js";

const FILE = "20260613T120000.001Z_ag-c92e.html";
const make = () => makeHtml(FILE, "ag-c92e", { id: "x", title: "Mock" });

describe("EmbedCard footer", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders Fullscreen / Reload / View source", () => {
    const e = make();
    render(<EmbedCard event={e} participants={PARTICIPANTS} allEvents={[e]} />);
    expect(
      screen.getByRole("button", { name: /Fullscreen/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /View source/ }),
    ).toBeInTheDocument();
  });

  test("Fullscreen opens preview modal; View source opens source mode", async () => {
    const user = userEvent.setup();
    const e = make();
    render(<EmbedCard event={e} participants={PARTICIPANTS} allEvents={[e]} />);
    await user.click(screen.getByRole("button", { name: /Fullscreen/ }));
    expect(useStore.getState().activeModal).toBe("html-preview");
    expect(useStore.getState().htmlPreview).toMatchObject({
      filename: FILE,
      title: "Mock",
      mode: "preview",
    });
    await user.click(screen.getByRole("button", { name: /View source/ }));
    expect(useStore.getState().htmlPreview).toMatchObject({ mode: "source" });
  });

  test("Reload bumps the iframe src without opening a modal", async () => {
    const user = userEvent.setup();
    const e = make();
    const { container } = render(
      <EmbedCard event={e} participants={PARTICIPANTS} allEvents={[e]} />,
    );
    const before = container
      .querySelector(".embed-frame iframe")!
      .getAttribute("src");
    await user.click(screen.getByRole("button", { name: /Reload/ }));
    const after = container
      .querySelector(".embed-frame iframe")!
      .getAttribute("src");
    expect(after).not.toBe(before);
    expect(after).toContain("reload=1");
    expect(useStore.getState().activeModal).toBeNull();
  });
});

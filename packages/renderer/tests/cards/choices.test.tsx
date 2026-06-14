import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoicesCard } from "../../src/cards/ChoicesCard.js";
import { useStore } from "../../src/state/store.js";
import {
  PARTICIPANTS,
  jsonResponse,
  makeChoice,
  makeChoices,
  resetStore,
} from "./_helpers.js";

describe("ChoicesCard", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders question + options; clicking an option POSTs a choice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ filename: "20260522T101000Z_us-a7f3.choice.json" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeChoices(
      "20260522T101000Z_ag-c92e.choices.json",
      "ag-c92e",
      {
        id: "approach",
        question: "Which approach?",
        options: [
          { id: "a", label: "Approach A" },
          { id: "b", label: "Approach B" },
        ],
        multi: false,
      },
    );
    render(
      <ChoicesCard event={ev} participants={PARTICIPANTS} allEvents={[ev]} />,
    );
    expect(screen.getByText("Which approach?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approach A/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/events\/choice$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.choices_id).toBe("approach");
    expect(body.selected).toEqual(["a"]);
    expect(body.participant_id).toBe("us-a7f3");
  });

  test("when the current user has already chosen, the chosen option shows .chosen", () => {
    const ev = makeChoices(
      "20260522T101000Z_ag-c92e.choices.json",
      "ag-c92e",
      {
        id: "approach",
        question: "Pick one",
        options: [
          { id: "a", label: "Apple" },
          { id: "b", label: "Banana" },
        ],
        multi: false,
      },
    );
    const ans = makeChoice(
      "20260522T101100Z_us-a7f3.choice.json",
      "us-a7f3",
      "approach",
      ["b"],
    );
    const { container } = render(
      <ChoicesCard
        event={ev}
        participants={PARTICIPANTS}
        allEvents={[ev, ans]}
      />,
    );
    const opts = container.querySelectorAll(".choice-opt");
    expect(opts.length).toBe(2);
    expect(opts[0]!.classList.contains("chosen")).toBe(false);
    expect(opts[0]!.classList.contains("faded")).toBe(true);
    expect(opts[1]!.classList.contains("chosen")).toBe(true);
    expect(opts[1]!.classList.contains("faded")).toBe(false);
    // The chosen option shows the .check badge.
    expect(opts[1]!.querySelector(".check")).not.toBeNull();
  });
});

describe("ChoicesCard — visual alternatives (options with html)", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  const makeVisual = () =>
    makeChoices("20260613T120000Z_ag-c92e.choices.json", "ag-c92e", {
      id: "design",
      question: "Which design?",
      options: [
        { id: "a", label: "Hero", html: "20260613T120000.001Z_ag-c92e.html" },
        { id: "b", label: "Split", html: "20260613T120000.002Z_ag-c92e.html" },
      ],
      multi: false,
    });

  test("renders a preview grid with one sandboxed iframe + Fullscreen per option", () => {
    const ev = makeVisual();
    const { container } = render(
      <ChoicesCard event={ev} participants={PARTICIPANTS} allEvents={[ev]} />,
    );
    expect(container.querySelector(".choices-options-grid")).not.toBeNull();
    expect(container.querySelectorAll(".choice-preview-card").length).toBe(2);
    const frames = container.querySelectorAll(".choice-preview-frame iframe");
    expect(frames.length).toBe(2);
    expect(frames[0]!.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frames[0]!.getAttribute("src")).toContain(
      "/raw/20260613T120000.001Z_ag-c92e.html/index.html",
    );
    expect(
      screen.getAllByRole("button", { name: /Fullscreen/ }).length,
    ).toBe(2);
    // No standalone text-button list is rendered for a visual widget.
    expect(container.querySelector(".choice-opt")).toBeNull();
  });

  test("selecting an option POSTs a choice with the same payload as text options", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ filename: "x_us-a7f3.choice.json" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const ev = makeVisual();
    render(
      <ChoicesCard event={ev} participants={PARTICIPANTS} allEvents={[ev]} />,
    );
    await user.click(screen.getByRole("button", { name: /Hero/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/events\/choice$/);
    const body = JSON.parse(init.body as string);
    expect(body.choices_id).toBe("design");
    expect(body.selected).toEqual(["a"]);
  });

  test("Fullscreen opens the html-preview modal for that option's bundle", async () => {
    const user = userEvent.setup();
    const ev = makeVisual();
    render(
      <ChoicesCard event={ev} participants={PARTICIPANTS} allEvents={[ev]} />,
    );
    expect(useStore.getState().activeModal).toBeNull();
    await user.click(screen.getAllByRole("button", { name: /Fullscreen/ })[0]!);
    const st = useStore.getState();
    expect(st.activeModal).toBe("html-preview");
    expect(st.htmlPreview).toMatchObject({
      filename: "20260613T120000.001Z_ag-c92e.html",
      title: "Hero",
      mode: "preview",
    });
  });

  test("shows the chosen state on the picked preview card", () => {
    const ev = makeVisual();
    const ans = makeChoice(
      "20260613T120100Z_us-a7f3.choice.json",
      "us-a7f3",
      "design",
      ["b"],
    );
    const { container } = render(
      <ChoicesCard
        event={ev}
        participants={PARTICIPANTS}
        allEvents={[ev, ans]}
      />,
    );
    const cards = container.querySelectorAll(".choice-preview-card");
    expect(cards[0]!.classList.contains("faded")).toBe(true);
    expect(cards[1]!.classList.contains("chosen")).toBe(true);
    expect(cards[1]!.querySelector(".check")).not.toBeNull();
  });
});

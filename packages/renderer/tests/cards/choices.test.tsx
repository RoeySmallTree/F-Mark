import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoicesCard } from "../../src/cards/ChoicesCard.js";
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

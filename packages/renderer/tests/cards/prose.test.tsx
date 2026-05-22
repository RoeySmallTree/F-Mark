import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProseCard } from "../../src/cards/ProseCard.js";
import { useStore } from "../../src/state/store.js";
import {
  PARTICIPANTS,
  makeProse,
  resetStore,
} from "./_helpers.js";

describe("ProseCard", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders title from name + markdown body in default rendered mode", () => {
    const ev = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      {
        name: "Launch Plan",
        content: "# Section\n\nA paragraph body.",
      },
    );
    const { container } = render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Launch Plan" })).toBeInTheDocument();
    // The markdown content should be rendered (not the source view).
    expect(container.querySelector("pre.fm-source")).toBeNull();
    expect(container.querySelector(".fm-prose")).not.toBeNull();
    expect(container.textContent).toContain("A paragraph body.");
    expect(container.querySelector(".prose-card.agent")).not.toBeNull();
  });

  test("clicking View source switches to source mode and toggles back", async () => {
    const user = userEvent.setup();
    const ev = makeProse(
      "20260522T120100Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Spec", content: "# Heading\n\nbody" },
    );
    const { container } = render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    expect(container.querySelector("pre.fm-source")).toBeNull();
    const btn = screen.getByRole("button", { name: /view source/i });
    await user.click(btn);
    const pre = container.querySelector("pre.fm-source");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("# Heading");
    // Click again → back to rendered.
    await user.click(btn);
    expect(container.querySelector("pre.fm-source")).toBeNull();
  });

  test("comment with target on this event renders a pin and click dispatches commentTarget", async () => {
    const user = userEvent.setup();
    const ev = makeProse(
      "20260522T120200Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "Body here" },
    );
    const comment = makeProse(
      "20260522T120300Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Pin me",
        target: { file: ev.filename, lines: [3, 3] },
      },
    );
    const { container } = render(
      <ProseCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[comment]}
      />,
    );
    const pin = container.querySelector(".prose-pin");
    expect(pin).not.toBeNull();
    expect(useStore.getState().commentTarget).toBeNull();
    await user.click(pin as Element);
    const target = useStore.getState().commentTarget;
    expect(target).not.toBeNull();
    expect(target!.file).toBe(ev.filename);
    expect(target!.lines?.[0]).toBe(3);
  });
});

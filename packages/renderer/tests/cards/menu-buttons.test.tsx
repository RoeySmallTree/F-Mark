/* Phase 15 — dead-button audit. Verifies that the `.menu` (•••) button on
   each card kind has a real onClick handler that copies the relevant content
   to the clipboard. Prior to this audit these buttons existed visually but
   were inert. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProseCard } from "../../src/cards/ProseCard.js";
import { ChoicesCard } from "../../src/cards/ChoicesCard.js";
import { EmbedCard } from "../../src/cards/EmbedCard.js";
import {
  PARTICIPANTS,
  makeChoices,
  makeHtml,
  makeProse,
  resetStore,
} from "./_helpers.js";

function getClipboardSpy(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe("Card .menu buttons are wired (Phase 15)", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("ProseCard copy button copies the prose content to clipboard", async () => {
    const user = userEvent.setup();
    const writeText = getClipboardSpy();
    const ev = makeProse("20260522T120000Z_us-a7f3.prose.md", "us-a7f3", {
      content: "# Hello world",
      name: "Hello",
    });
    render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    const copyBtn = screen.getByRole("button", {
      name: /copy as markdown/i,
    });
    await user.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith("# Hello world");
  });

  test("ChoicesCard .menu copies the question", async () => {
    const user = userEvent.setup();
    const writeText = getClipboardSpy();
    const ev = makeChoices(
      "20260522T120000Z_ag-c92e.choices.json",
      "ag-c92e",
      {
        id: "ch-1",
        question: "Which color?",
        multi: false,
        options: [
          { id: "red", label: "Red" },
          { id: "blue", label: "Blue" },
        ],
      },
    );
    render(
      <ChoicesCard
        event={ev}
        participants={PARTICIPANTS}
        allEvents={[ev]}
      />,
    );
    const menuBtn = screen.getByRole("button", { name: /copy question/i });
    await user.click(menuBtn);
    expect(writeText).toHaveBeenCalledWith("Which color?");
  });

  test("EmbedCard .menu copies the embed link", async () => {
    const user = userEvent.setup();
    const writeText = getClipboardSpy();
    const ev = makeHtml("20260522T120000Z_ag-c92e.html.json", "ag-c92e", {
      id: "diagram-1",
      title: "System diagram",
    });
    render(
      <EmbedCard event={ev} participants={PARTICIPANTS} allEvents={[ev]} />,
    );
    const menuBtn = screen.getByRole("button", { name: /copy embed link/i });
    await user.click(menuBtn);
    expect(writeText).toHaveBeenCalled();
    const arg = (writeText.mock.calls[0]?.[0] ?? "") as string;
    expect(arg).toContain("/sessions/2026-05-22-launch-planning/raw/");
    expect(arg).toContain("/index.html");
  });
});

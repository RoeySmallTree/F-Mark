import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MessageCard } from "../../src/cards/MessageCard.js";
import { PARTICIPANTS, makeProse, resetStore } from "./_helpers.js";

describe("MessageCard", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("renders unnamed prose with rendered markdown body and user color stripe", () => {
    const ev = makeProse(
      "20260522T101000Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "Hello **world**" },
    );
    const { container } = render(
      <MessageCard event={ev} participants={PARTICIPANTS} />,
    );
    const card = container.querySelector(".card.msg-card");
    expect(card).not.toBeNull();
    expect(card!.classList.contains("user")).toBe(true);
    expect(card!.querySelector(".stripe")).not.toBeNull();
    expect(screen.getByText("Roey")).toBeInTheDocument();
    // Rendered markdown emits <strong>world</strong>.
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe("world");
  });

  test("agent participant produces .card.agent and the right initial", () => {
    const ev = makeProse(
      "20260522T101100Z_ag-c92e.prose.md",
      "ag-c92e",
      { content: "agent here" },
    );
    const { container } = render(
      <MessageCard event={ev} participants={PARTICIPANTS} />,
    );
    const card = container.querySelector(".card.msg-card");
    expect(card!.classList.contains("agent")).toBe(true);
    expect(card!.querySelector(".avatar")?.textContent).toBe("C");
  });
});

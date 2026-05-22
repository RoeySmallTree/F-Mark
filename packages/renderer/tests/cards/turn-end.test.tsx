import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TurnEndDivider } from "../../src/cards/TurnEndDivider.js";
import { PARTICIPANTS, makeTurnEnd, resetStore } from "./_helpers.js";

describe("TurnEndDivider", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("user participant id yields .turn-end.user class and name in label", () => {
    const ev = makeTurnEnd(
      "20260522T130000Z_us-a7f3.turn-end.json",
      "us-a7f3",
    );
    const { container } = render(
      <TurnEndDivider event={ev} participants={PARTICIPANTS} />,
    );
    const root = container.querySelector(".turn-end");
    expect(root).not.toBeNull();
    expect(root!.classList.contains("user")).toBe(true);
    expect(root!.classList.contains("agent")).toBe(false);
    expect(root!.textContent).toMatch(/Roey/);
  });

  test("agent participant id yields .turn-end.agent class", () => {
    const ev = makeTurnEnd(
      "20260522T130100Z_ag-c92e.turn-end.json",
      "ag-c92e",
    );
    const { container } = render(
      <TurnEndDivider event={ev} participants={PARTICIPANTS} />,
    );
    const root = container.querySelector(".turn-end");
    expect(root!.classList.contains("agent")).toBe(true);
    expect(root!.classList.contains("user")).toBe(false);
    expect(root!.textContent).toMatch(/Claude/);
  });
});

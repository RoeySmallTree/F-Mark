import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewStatePage } from "../../src/pages/ReviewStatePage.js";

describe("ReviewStatePage", () => {
  afterEach(() => cleanup());

  it("renders the complete audit snapshot and recommendation", () => {
    const { container } = render(<ReviewStatePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Review state" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Deepen the turn-lifecycle module first.",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".review-state-finding")).toHaveLength(30);
    expect(container.querySelectorAll('[data-priority="P1"]')).toHaveLength(17);
    expect(container.querySelectorAll('[data-priority="P2"]')).toHaveLength(10);
    expect(container.querySelectorAll('[data-priority="P3"]')).toHaveLength(3);
    expect(container.querySelectorAll(".review-state-candidate")).toHaveLength(8);
    expect(container.querySelectorAll(".review-state-file-mitigation")).toHaveLength(3);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Make files progressive, warm, and discussable",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Security deliberately excluded")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { ModeToggle } from "../../src/render/ModeToggle.js";

afterEach(() => cleanup());

type Mode = "rendered" | "source" | "accordion";

const options: { value: Mode; label: string }[] = [
  { value: "rendered", label: "Rendered" },
  { value: "source", label: "Source" },
  { value: "accordion", label: "Accordion" },
];

describe("ModeToggle", () => {
  it("renders every option label as a button", () => {
    render(
      <ModeToggle<Mode>
        options={options}
        value="rendered"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Rendered")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Accordion")).toBeInTheDocument();
  });

  it("marks the active option with the `on` class and aria-pressed", () => {
    const { container } = render(
      <ModeToggle<Mode>
        options={options}
        value="source"
        onChange={() => {}}
      />,
    );
    const buttons = container.querySelectorAll("button.fm-mode-toggle-btn");
    expect(buttons.length).toBe(3);
    const active = container.querySelector("button.fm-mode-toggle-btn.on");
    expect(active).not.toBeNull();
    expect(active!.textContent).toBe("Source");
    expect(active!.getAttribute("aria-pressed")).toBe("true");
    // The other buttons should not have `on`.
    const others = Array.from(buttons).filter((b) => b !== active);
    for (const b of others) {
      expect(b.classList.contains("on")).toBe(false);
      expect(b.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    render(
      <ModeToggle<Mode>
        options={options}
        value="rendered"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Accordion"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("accordion");
  });

  it("does not call onChange when clicking the already-active option", () => {
    const onChange = vi.fn();
    render(
      <ModeToggle<Mode>
        options={options}
        value="source"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Source"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

import { useRef, useState, type JSX } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { useFocusTrap } from "../../src/a11y/useFocusTrap.js";

/* jsdom does not run layout, so HTMLElement.offsetParent is always null —
   the hook's real "is this actually visible" check would go inert here and
   every test would pass for the wrong reason (an empty focusable list looks
   the same as a correctly-scoped one). Shim it to the one thing this suite
   needs: non-null unless the element was explicitly detached. */
Object.defineProperty(HTMLElement.prototype, "offsetParent", {
  configurable: true,
  get(this: HTMLElement) {
    return this.parentElement;
  },
});

afterEach(cleanup);

function Trapped({ onClose }: { onClose(): void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button>first</button>
      <button>last</button>
      <button onClick={onClose}>close</button>
    </div>
  );
}

function Harness(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>trigger</button>
      {open ? <Trapped onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

describe("useFocusTrap", () => {
  test("Tab stays inside the trapped container and wraps at the edges", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "trigger" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));

    // first -> last -> close -> wraps back to first, never reaching "trigger"
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "last" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "close" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  test("focus returns to the trigger when the trap unmounts", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "trigger" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "close" }));

    expect(document.activeElement).toBe(trigger);
  });
});

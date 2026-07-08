import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { MarkdownRenderer } from "./MarkdownRenderer";

afterEach(cleanup);

/* A merged prose run re-renders on every streamed delta and the app mounts
   under React.StrictMode, which replays layout effects on mount. The reveal
   must survive both: animate the initial chunk even through the replay, and
   on growth settle prior words while animating only the appended tail. */

test("initial word reveal still animates through a StrictMode double-invoke", () => {
  const { container } = render(
    <StrictMode>
      <MarkdownRenderer content="alpha beta gamma delta" revealWords />
    </StrictMode>,
  );

  const spans = container.querySelectorAll(".fm-word-reveal");
  expect(spans.length).toBeGreaterThan(0);
  // If the replayed cleanup settled every word, the first chunk would appear
  // with no animation. At least one word must still be mid-reveal.
  const allSettled = Array.from(spans).every((s) =>
    s.classList.contains("is-done"),
  );
  expect(allSettled).toBe(false);
});

test("appending content settles prior words and animates only the new tail", () => {
  const { container, rerender } = render(
    <MarkdownRenderer content="alpha beta" revealWords />,
  );
  rerender(<MarkdownRenderer content="alpha beta gamma delta" revealWords />);

  const spans = Array.from(container.querySelectorAll(".fm-word-reveal"));
  expect(spans).toHaveLength(4);
  expect(spans[0]!.classList.contains("is-done")).toBe(true);
  expect(spans[1]!.classList.contains("is-done")).toBe(true);
  expect(spans[2]!.classList.contains("is-done")).toBe(false);
  expect(spans[3]!.classList.contains("is-done")).toBe(false);
});

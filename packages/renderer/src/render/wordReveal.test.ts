import { describe, expect, test } from "vitest";
import { revealWordsInElement } from "./wordReveal";

function paragraph(text: string): HTMLElement {
  const root = document.createElement("div");
  const p = document.createElement("p");
  p.textContent = text;
  root.appendChild(p);
  return root;
}

function isDone(span: Element): boolean {
  return span.classList.contains("is-done");
}

/* A merged prose run re-renders on every streamed delta. Re-animating the
   whole message each time would re-scramble already-settled text, so the
   reveal must finish the words a previous pass already showed and animate
   only the newly-appended tail. */
describe("revealWordsInElement tail reveal", () => {
  test("settles words before startIndex and animates the rest", () => {
    const root = paragraph("alpha beta gamma delta");

    const handle = revealWordsInElement(root, 2);
    const spans = root.querySelectorAll(".fm-word-reveal");

    expect(spans).toHaveLength(4);
    expect(isDone(spans[0]!)).toBe(true);
    expect(isDone(spans[1]!)).toBe(true);
    expect(isDone(spans[2]!)).toBe(false);
    expect(isDone(spans[3]!)).toBe(false);

    handle.cancel();
  });

  test("reports the total word count so the next pass can resume", () => {
    const root = paragraph("one two three");
    const handle = revealWordsInElement(root);

    expect(handle.total).toBe(3);
    handle.cancel();
  });

  test("defaults to animating every word", () => {
    const root = paragraph("first second");
    const handle = revealWordsInElement(root);
    const spans = root.querySelectorAll(".fm-word-reveal");

    expect(spans).toHaveLength(2);
    expect(isDone(spans[0]!)).toBe(false);
    expect(isDone(spans[1]!)).toBe(false);

    handle.cancel();
  });
});

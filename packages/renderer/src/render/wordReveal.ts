const NO_LOOSE_STRING_VALUES = {
  isPending: "is-pending",
  isActive: "is-active",
  fmWordRevealText: "fm-word-reveal-text",
  isDone: "is-done",
} as const;

const CHARACTER_SET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const WORD_REVEAL_DURATION_MS = 260;
const WORD_REVEAL_STAGGER_MS = 28;
const WORD_REVEAL_MAX_STAGGER_MS = 1400;

export interface WordRevealHandle {
  cancel(): void;
  /** Total word spans wrapped this pass. Feed it back as `startIndex` the
     next time the same element re-renders with appended content so the words
     a prior pass already showed stay settled and only the new tail animates. */
  total: number;
}

export function revealWordsInElement(
  root: HTMLElement,
  startIndex = 0,
): WordRevealHandle {
  const allSpans = prepareWordRevealSpans(root);
  const total = allSpans.length;
  const boundary = Math.min(Math.max(0, startIndex), total);
  finishWords(allSpans.slice(0, boundary));
  const spans = allSpans.slice(boundary);
  // Reset the slice we're about to animate to `is-pending`. Persisted spans
  // (e.g. settled by a StrictMode replay's cleanup) would otherwise stay
  // `is-done` and skip the animation entirely.
  for (const span of spans) pendWord(span);

  if (spans.length === 0 || prefersReducedMotion(root)) {
    finishWords(spans);
    return { cancel: () => undefined, total };
  }

  const view = root.ownerDocument.defaultView;
  const startedAt = frameNow(view);
  const stagger =
    spans.length <= 1
      ? 0
      : Math.min(
          WORD_REVEAL_STAGGER_MS,
          WORD_REVEAL_MAX_STAGGER_MS / (spans.length - 1),
        );
  let frameId = 0;
  let cancelled = false;

  const tick = (): void => {
    if (cancelled) return;
    const elapsed = frameNow(view) - startedAt;
    let complete = true;

    spans.forEach((span, index) => {
      const word = span.dataset.wordRevealText ?? "";
      const progress = (elapsed - index * stagger) / WORD_REVEAL_DURATION_MS;

      if (progress <= 0) {
        complete = false;
        return;
      }

      if (progress >= 1) {
        finishWord(span);
        return;
      }

      complete = false;
      span.classList.remove(NO_LOOSE_STRING_VALUES.isPending);
      span.classList.add(NO_LOOSE_STRING_VALUES.isActive);
      span.dataset.wordRevealCurrent = scrambleWord(word, progress);
    });

    if (!complete) {
      frameId = scheduleFrame(view, tick);
    }
  };

  frameId = scheduleFrame(view, tick);
  return {
    cancel: () => {
      cancelled = true;
      cancelFrame(view, frameId);
      finishWords(spans);
    },
    total,
  };
}

function prepareWordRevealSpans(root: HTMLElement): HTMLElement[] {
  wrapEligibleTextNodes(root);
  return Array.from(root.querySelectorAll<HTMLElement>(".fm-word-reveal"));
}

function wrapEligibleTextNodes(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const nodeFilter = view?.NodeFilter ?? NodeFilter;
  const walker = doc.createTreeWalker(root, nodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text)) return nodeFilter.FILTER_REJECT;
      if (shouldSkipTextNode(node)) return nodeFilter.FILTER_REJECT;
      return nodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current !== null) {
    if (current instanceof Text) textNodes.push(current);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    wrapTextNode(textNode);
  }
}

function shouldSkipTextNode(node: Text): boolean {
  if ((node.nodeValue ?? "").trim().length === 0) return true;
  const parent = node.parentElement;
  if (parent === null) return true;
  return (
    parent.closest(
      "pre, code, kbd, samp, script, style, textarea, .fm-word-reveal",
    ) !== null
  );
}

function wrapTextNode(textNode: Text): void {
  const value = textNode.nodeValue ?? "";
  const parts = value.split(/(\s+)/);
  const doc = textNode.ownerDocument;
  const fragment = doc.createDocumentFragment();
  let wrappedAny = false;

  for (const part of parts) {
    if (part.length === 0) continue;
    if (/^\s+$/.test(part)) {
      fragment.append(doc.createTextNode(part));
      continue;
    }
    fragment.append(wordRevealSpan(doc, part));
    wrappedAny = true;
  }

  if (wrappedAny) textNode.replaceWith(fragment);
}

function wordRevealSpan(doc: Document, word: string): HTMLElement {
  const span = doc.createElement("span");
  span.className = "fm-word-reveal is-pending";
  span.dataset.wordRevealText = word;
  span.dataset.wordRevealCurrent = "";

  const text = doc.createElement("span");
  text.className = NO_LOOSE_STRING_VALUES.fmWordRevealText;
  text.textContent = word;
  span.append(text);
  return span;
}

function scrambleWord(word: string, progress: number): string {
  const chars = Array.from(word);
  const revealUntil = Math.floor(chars.length * progress);
  return chars
    .map((char, index) => {
      if (!/[A-Za-z0-9]/.test(char)) return char;
      return index <= revealUntil ? char : randomCharacter();
    })
    .join("");
}

function randomCharacter(): string {
  return CHARACTER_SET[Math.floor(Math.random() * CHARACTER_SET.length)] ?? "A";
}

function finishWords(spans: readonly HTMLElement[]): void {
  for (const span of spans) finishWord(span);
}

function finishWord(span: HTMLElement): void {
  span.classList.remove(NO_LOOSE_STRING_VALUES.isPending, NO_LOOSE_STRING_VALUES.isActive);
  span.classList.add(NO_LOOSE_STRING_VALUES.isDone);
  delete span.dataset.wordRevealCurrent;
}

function pendWord(span: HTMLElement): void {
  span.classList.remove(NO_LOOSE_STRING_VALUES.isDone, NO_LOOSE_STRING_VALUES.isActive);
  span.classList.add(NO_LOOSE_STRING_VALUES.isPending);
  span.dataset.wordRevealCurrent = "";
}

function prefersReducedMotion(root: HTMLElement): boolean {
  const matchMedia = root.ownerDocument.defaultView?.matchMedia;
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function frameNow(view: Window | null): number {
  return view?.performance?.now() ?? globalThis.performance?.now() ?? Date.now();
}

function scheduleFrame(view: Window | null, callback: () => void): number {
  const raf = view?.requestAnimationFrame;
  if (raf !== undefined) return raf.call(view, callback);
  return window.setTimeout(callback, 16);
}

function cancelFrame(view: Window | null, frameId: number): void {
  const cancelRaf = view?.cancelAnimationFrame;
  if (cancelRaf !== undefined) {
    cancelRaf.call(view, frameId);
    return;
  }
  window.clearTimeout(frameId);
}

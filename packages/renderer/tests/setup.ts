import "@testing-library/jest-dom/vitest";

// React Flow uses ResizeObserver + DOMMatrixReadOnly + getBoundingClientRect.
// jsdom either omits them or returns zeros. Provide minimal shims so
// FlowCard tests can render the graph without crashing.

class ResizeObserverShim {
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    ResizeObserverShim as unknown as typeof ResizeObserver;
}

// Feed.tsx uses IntersectionObserver to advance read-position; jsdom omits
// it entirely. The Feed contract only needs the constructor + observe/
// disconnect — actual intersection callbacks aren't fired in tests.
class IntersectionObserverShim {
  root: Element | null = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
  takeRecords(): unknown[] {
    return [];
  }
}
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    IntersectionObserverShim as unknown as typeof IntersectionObserver;
}

// jsdom doesn't implement Element.scrollIntoView; Feed.tsx's read-position
// restore + nav cluster + follow mode all call it. A no-op stub is fine —
// tests don't assert on scroll position, just that no exception is raised.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = function (): void {
    /* noop */
  };
}

// jsdom also omits Element.scrollTo; Feed.tsx's first-open anchor seed +
// onScrollToBottom both call it. Same no-op stub strategy.
if (
  typeof Element !== "undefined" &&
  typeof (Element.prototype as unknown as { scrollTo?: unknown }).scrollTo !==
    "function"
) {
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo =
    function (): void {
      /* noop */
    };
}

if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
  class DOMMatrixReadOnlyShim {
    m22 = 1;
    constructor(_v?: string | number[]) {
      /* noop */
    }
  }
  // @ts-expect-error jsdom missing constructor
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyShim;
}

// React Flow measures the viewport via getBoundingClientRect; jsdom returns
// zeros which makes the graph collapse to 0x0 and nodes never render. Floor
// any zero-area rect to 200x100 — large enough for React Flow to lay nodes
// out and for testing-library to find their text.
// jsdom's URL.createObjectURL stub throws on File/Blob in some versions.
// Compose.stageFiles relies on it for chip thumbnails; shim a minimal
// implementation so tests don't crash before the upload fetch fires.
if (typeof URL !== "undefined") {
  let counter = 0;
  if (typeof URL.createObjectURL !== "function") {
    URL.createObjectURL = (): string => `blob:test/${++counter}`;
  }
  if (typeof URL.revokeObjectURL !== "function") {
    URL.revokeObjectURL = (): void => {};
  }
}

if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.getBoundingClientRect === "function"
) {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    const r = original.call(this);
    if (r.width === 0 && r.height === 0) {
      return {
        ...r,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        toJSON() {
          return r;
        },
      } as DOMRect;
    }
    return r;
  };
}

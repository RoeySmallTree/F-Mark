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

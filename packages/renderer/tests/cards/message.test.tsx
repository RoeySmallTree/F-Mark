import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MessageCard } from "../../src/cards/MessageCard.js";
import { PARTICIPANTS, makeProse, resetStore } from "./_helpers.js";

function rect(top: number, bottom: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 200,
    width: 200,
    height: bottom - top,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function rectList(...rects: DOMRect[]): DOMRectList {
  return Object.assign(rects, {
    item(index: number) {
      return rects[index] ?? null;
    },
  }) as unknown as DOMRectList;
}

function selectionFor({
  anchorNode,
  focusNode = anchorNode,
  text,
  range,
}: {
  anchorNode: Node | null;
  focusNode?: Node | null;
  text: string;
  range?: Range;
}): Selection {
  return {
    rangeCount: range === undefined ? 0 : 1,
    isCollapsed: range === undefined || text.trim().length === 0,
    anchorNode,
    focusNode,
    toString() {
      return text;
    },
    getRangeAt() {
      if (range === undefined) throw new Error("no range");
      return range;
    },
    removeAllRanges() {
      /* noop */
    },
  } as unknown as Selection;
}

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
      <MessageCard event={ev} participants={PARTICIPANTS} comments={[]} />,
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

  test("agent participant produces .card.agent and a masked avatar icon", () => {
    const ev = makeProse(
      "20260522T101100Z_ag-c92e.prose.md",
      "ag-c92e",
      { content: "agent here" },
    );
    const { container } = render(
      <MessageCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    const card = container.querySelector(".card.msg-card");
    expect(card!.classList.contains("agent")).toBe(true);
    expect(
      card!.querySelector(".avatar [data-avatar-kind='claude']"),
    ).not.toBeNull();
    expect(card!.querySelector(".avatar .avatar-art-glyph")).not.toBeNull();
  });

  test("hover draft marker follows the rendered row within a wrapped message line", () => {
    const rangeSpy = vi.spyOn(document, "createRange").mockImplementation(() => {
      let selectedNode: Node | null = null;
      return {
        selectNodeContents(node: Node) {
          selectedNode = node;
        },
        getClientRects() {
          const text = selectedNode?.textContent ?? "";
          if (text.includes("wraps across two visual rows")) {
            return rectList(rect(0, 18), rect(22, 40));
          }
          return rectList();
        },
        detach() {
          /* noop */
        },
      } as unknown as Range;
    });
    try {
      const ev = makeProse(
        "20260522T101200Z_us-a7f3.prose.md",
        "us-a7f3",
        { content: "This wraps across two visual rows in the rendered message." },
      );
      const { container } = render(
        <MessageCard event={ev} participants={PARTICIPANTS} comments={[]} />,
      );
      const content = container.querySelector(".commentable-content") as HTMLElement;
      fireEvent.mouseMove(content, { clientY: 30 });

      const marker = screen.getByLabelText(/Add comment on line 1/i);
      const anchor = marker.closest(".line-comment-anchor") as HTMLElement | null;
      const lineNumber = container.querySelector(
        ".line-comment-line-number",
      ) as HTMLElement | null;
      expect(anchor).not.toBeNull();
      expect(anchor!.dataset.targetLines).toBe("1:1");
      expect(Number.parseFloat(anchor!.style.top)).toBeGreaterThan(10);
      expect(Number.parseFloat(anchor!.style.height)).toBeLessThanOrEqual(32);
      expect(lineNumber).not.toBeNull();
      expect(lineNumber!.textContent).toBe("1");
      expect(lineNumber!.dataset.targetLines).toBe("1:1");
      expect(Number.parseFloat(lineNumber!.style.top)).toBeGreaterThan(20);
    } finally {
      rangeSpy.mockRestore();
    }
  });

  test("clears a selected-text draft marker when clicking away", async () => {
    const ev = makeProse(
      "20260522T101300Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "Selectable text\nSecond line" },
    );
    const { container } = render(
      <MessageCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    const content = container.querySelector(".commentable-content") as HTMLElement;
    const textNode = content.querySelector("p")?.firstChild ?? null;
    expect(textNode).not.toBeNull();

    const range = {
      getClientRects() {
        return rectList(rect(0, 18));
      },
      toString() {
        return "Selectable text";
      },
    } as unknown as Range;
    const selectionSpy = vi
      .spyOn(window, "getSelection")
      .mockReturnValue(
        selectionFor({ anchorNode: textNode, text: "Selectable text", range }),
      );
    try {
      fireEvent.mouseUp(content);
      expect(
        await screen.findByLabelText(/Add comment on line 1/i),
      ).toBeInTheDocument();

      selectionSpy.mockReturnValue(
        selectionFor({ anchorNode: null, focusNode: null, text: "" }),
      );
      fireEvent.mouseDown(document.body);
      expect(screen.queryByLabelText(/Add comment on line 1/i)).toBeNull();
    } finally {
      selectionSpy.mockRestore();
    }
  });

  test("clicking the right-side draft marker keeps the hovered content line", async () => {
    const ev = makeProse(
      "20260522T101400Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "First line\nSecond line" },
    );
    const { container } = render(
      <MessageCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    const content = container.querySelector(".commentable-content") as HTMLElement;

    fireEvent.mouseMove(content, { clientY: 5 });
    const marker = await screen.findByLabelText(/Add comment on line 1/i);

    fireEvent.mouseMove(marker, { clientY: 35 });
    fireEvent.click(marker);

    const popover = container.querySelector(".line-comment-popover") as HTMLElement;
    expect(popover).not.toBeNull();
    expect(within(popover).getByPlaceholderText("Add a comment…")).toBeInTheDocument();
    expect(popover.querySelector(".comment-anchor-snippet")).not.toBeNull();
  });
});

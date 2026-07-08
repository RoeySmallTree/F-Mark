import { describe, expect, test } from "vitest";
import { fixedThreadPopoverStyle } from "../../src/cards/lineCommentRail/popoverPosition.js";

describe("fixedThreadPopoverStyle", () => {
  test("bottom-anchors below the line and sets a generous max height", () => {
    const anchor = {
      getBoundingClientRect: () => ({
        top: 200,
        right: 900,
        bottom: 400,
        left: 100,
        width: 800,
        height: 200,
        x: 100,
        y: 200,
        toJSON: () => ({}),
      }),
    } as HTMLElement;

    const style = fixedThreadPopoverStyle(anchor, 48);

    expect(style.position).toBe("fixed");
    expect(style.bottom).toBeTypeOf("number");
    expect(style.top).toBe("auto");
    expect(style.maxHeight).toBeTypeOf("number");
    expect(style.maxHeight as number).toBeGreaterThanOrEqual(280);
  });
});

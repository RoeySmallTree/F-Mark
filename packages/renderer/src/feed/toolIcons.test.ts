import { describe, it, expect } from "vitest";
import { iconForTool, DEFAULT_TOOL_ICON } from "./toolIcons";

describe("iconForTool", () => {
  it("known names map to specific icons", () => {
    expect(iconForTool("Bash")).toBe("Terminal");
    expect(iconForTool("Read")).toBe("FileText");
    expect(iconForTool("Edit")).toBe("Edit3");
    expect(iconForTool("Write")).toBe("FilePlus");
    expect(iconForTool("WebFetch")).toBe("Globe");
    expect(iconForTool("WebSearch")).toBe("Search");
  });

  it("unknown names fall back to the default icon", () => {
    expect(iconForTool("SomethingNew")).toBe(DEFAULT_TOOL_ICON);
  });

  it("case-insensitive matching", () => {
    expect(iconForTool("bash")).toBe("Terminal");
    expect(iconForTool("READ")).toBe("FileText");
  });
});

import { describe, it, expect } from "vitest";
import { assemblePopoverSrcdoc } from "./popover";

describe("assemblePopoverSrcdoc", () => {
  it("returns a full HTML doc when only html is provided", () => {
    const out = assemblePopoverSrcdoc({ html: "<p>hi</p>" });
    expect(out).toContain("<!doctype html>");
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("<script>");
  });

  it("inlines css inside <style>", () => {
    const out = assemblePopoverSrcdoc({
      html: "<p>x</p>",
      css: "p{color:red}",
    });
    expect(out).toMatch(/<style>[\s\S]*p\{color:red\}[\s\S]*<\/style>/);
  });

  it("inlines js inside <script>", () => {
    const out = assemblePopoverSrcdoc({
      html: "<button>x</button>",
      js: "console.log('go')",
    });
    expect(out).toMatch(/<script>[\s\S]*console\.log\('go'\)[\s\S]*<\/script>/);
  });

  it("includes a base style block so popovers without css still look like F-Mark", () => {
    const out = assemblePopoverSrcdoc({ html: "<p>x</p>" });
    expect(out).toContain("font-family: system-ui");
    expect(out).toContain("color: #1a1714");
  });
});

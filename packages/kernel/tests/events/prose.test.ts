import { describe, it, expect } from "vitest";
import { serializeProse, parseProse } from "../../src/events/prose.js";

describe("prose serialize/parse", () => {
  it("serialises with no frontmatter when no optional fields", () => {
    expect(serializeProse({ content: "hello" })).toBe("hello");
  });

  it("includes name in frontmatter when present", () => {
    const out = serializeProse({ content: "body", name: "Launch Plan" });
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("name: Launch Plan");
    expect(out.trim().endsWith("body")).toBe(true);
  });

  it("serialises target with file and lines", () => {
    const out = serializeProse({
      content: "comment",
      target: { file: "x.prose.md", lines: [3, 5] },
    });
    expect(out).toContain("target:");
    expect(out).toContain("file: x.prose.md");
    expect(out).toContain("lines:");
  });

  it("parseProse on no-frontmatter content", () => {
    expect(parseProse("hello")).toEqual({ content: "hello" });
  });

  it("parseProse round-trips name + target", () => {
    const out = serializeProse({
      content: "body",
      name: "doc",
      target: { file: "a.prose.md" },
      in_reply_to: "b.prose.md",
    });
    const parsed = parseProse(out);
    expect(parsed.content.trim()).toBe("body");
    expect(parsed.name).toBe("doc");
    expect(parsed.target).toEqual({ file: "a.prose.md" });
    expect(parsed.in_reply_to).toBe("b.prose.md");
  });

  it("parseProse includes supersedes if set", () => {
    const out = serializeProse({ content: "v2", supersedes: "old.prose.md" });
    expect(parseProse(out).supersedes).toBe("old.prose.md");
  });
});

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

  it("serialises a comment in the new shape (append_to + mode + lines)", () => {
    const out = serializeProse({
      content: "comment",
      append_to: "x.prose.md",
      mode: "comment",
      lines: [3, 5],
    });
    expect(out).toContain("append_to: x.prose.md");
    expect(out).toContain("mode: comment");
    expect(out).toContain("lines:");
    /* Serializer must never emit the legacy `target:` block. */
    expect(out).not.toContain("target:");
  });

  it("serialises a file comment (file_path + lines + diff_hunk + diff_base)", () => {
    const out = serializeProse({
      content: "this hunk looks wrong",
      file_path: "src/app.ts",
      lines: [10, 12],
      diff_hunk: "@@ -1 +1 @@\n-a\n+b",
      diff_base: "current-session",
    });
    expect(out).toContain("file_path: src/app.ts");
    expect(out).toContain("diff_base: current-session");
    expect(out).toContain("lines:");
    expect(out).not.toContain("append_to:");
  });

  it("parseProse on no-frontmatter content", () => {
    expect(parseProse("hello")).toEqual({ content: "hello" });
  });

  it("parseProse round-trips name + new comment shape + in_reply_to", () => {
    const out = serializeProse({
      content: "body",
      name: "doc",
      in_reply_to: "b.prose.md",
    });
    const parsed = parseProse(out);
    expect(parsed.content.trim()).toBe("body");
    expect(parsed.name).toBe("doc");
    expect(parsed.in_reply_to).toBe("b.prose.md");
  });

  it("parseProse includes supersedes if set", () => {
    const out = serializeProse({ content: "v2", supersedes: "old.prose.md" });
    expect(parseProse(out).supersedes).toBe("old.prose.md");
  });

  it("parseProse round-trips a file comment", () => {
    const out = serializeProse({
      content: "comment",
      file_path: "src/app.ts",
      lines: [3, 5],
      diff_hunk: "@@ -1 +1 @@",
      diff_base: "whole-branch",
    });
    const parsed = parseProse(out);
    expect(parsed.file_path).toBe("src/app.ts");
    expect(parsed.lines).toEqual([3, 5]);
    expect(parsed.diff_hunk).toBe("@@ -1 +1 @@");
    expect(parsed.diff_base).toBe("whole-branch");
    expect(parsed.append_to).toBeUndefined();
  });

  it("parseProse round-trips line_context for line-drift repair", () => {
    const out = serializeProse({
      content: "c",
      file_path: "a.ts",
      line_context: {
        selected: "const x = 1;",
        sha256: "abc123",
        before: "// header",
        after: "}",
      },
    });
    const parsed = parseProse(out);
    expect(parsed.line_context).toEqual({
      selected: "const x = 1;",
      sha256: "abc123",
      before: "// header",
      after: "}",
    });
  });

  it("parseProse reads new fields cleanly", () => {
    const out = serializeProse({
      content: "block body",
      append_to: "doc.prose.md",
      name: "Section A",
    });
    const parsed = parseProse(out);
    expect(parsed.append_to).toBe("doc.prose.md");
    expect(parsed.name).toBe("Section A");
  });

  it("parseProse reads removed: true", () => {
    const out = serializeProse({
      content: "",
      append_to: "doc.prose.md",
      removed: true,
    });
    expect(out).toContain("removed: true");
    const parsed = parseProse(out);
    expect(parsed.removed).toBe(true);
    expect(parsed.append_to).toBe("doc.prose.md");
  });
});

describe("prose `arbitrary` flag", () => {
  it("serialises with arbitrary: true in frontmatter when set", () => {
    const out = serializeProse({ content: "thinking out loud", arbitrary: true });
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("arbitrary: true");
    expect(out).toContain("\nthinking out loud");
  });

  it("omits arbitrary from frontmatter when false (default semantics)", () => {
    const out = serializeProse({ content: "deliberate", arbitrary: false });
    expect(out).toBe("deliberate"); // no frontmatter at all
  });

  it("omits arbitrary from frontmatter when undefined", () => {
    const out = serializeProse({ content: "deliberate" });
    expect(out).toBe("deliberate");
  });

  it("parses arbitrary back as boolean", () => {
    const md = "---\narbitrary: true\n---\nbody";
    expect(parseProse(md)).toEqual({ content: "body", arbitrary: true });
  });

  it("parses missing arbitrary as undefined (not false)", () => {
    expect(parseProse("plain")).toEqual({ content: "plain" });
  });

  it("coexists with name and new comment shape", () => {
    const out = serializeProse({
      content: "midstream comment",
      name: "Draft",
      arbitrary: true,
    });
    expect(out).toContain("name: Draft");
    expect(out).toContain("arbitrary: true");
  });
});

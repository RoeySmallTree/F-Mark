import { describe, it, expect, vi } from "vitest";
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

  it("never emits `target` field in serialized frontmatter (legacy ignored)", () => {
    /* Even if a caller passes the legacy `target`, the serializer drops
       it — only `append_to`/`mode`/`lines` make it to disk. */
    const out = serializeProse({
      content: "comment",
      // @ts-expect-error — intentionally pass legacy field
      target: { file: "x.prose.md", lines: [3, 5] },
    });
    expect(out).not.toContain("target:");
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

  it("parseProse maps legacy `target` → append_to + mode=comment + lines", () => {
    /* Build a legacy-shape doc by hand (the serializer no longer emits it). */
    const legacy = [
      "---",
      "target:",
      "  file: x.prose.md",
      "  lines:",
      "    - 3",
      "    - 5",
      "---",
      "comment",
    ].join("\n");
    const parsed = parseProse(legacy);
    expect(parsed.target).toBeUndefined();
    expect(parsed.append_to).toBe("x.prose.md");
    expect(parsed.mode).toBe("comment");
    expect(parsed.lines).toEqual([3, 5]);
  });

  it("parseProse legacy `target` without lines → card-level comment", () => {
    const legacy = [
      "---",
      "target:",
      "  file: x.prose.md",
      "---",
      "comment",
    ].join("\n");
    const parsed = parseProse(legacy);
    expect(parsed.append_to).toBe("x.prose.md");
    expect(parsed.mode).toBe("comment");
    expect(parsed.lines).toBeUndefined();
    expect(parsed.target).toBeUndefined();
  });

  it("parseProse prefers new fields when BOTH legacy `target` and new are present + warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const both = [
      "---",
      "append_to: new.prose.md",
      "mode: comment",
      "target:",
      "  file: old.prose.md",
      "---",
      "comment",
    ].join("\n");
    const parsed = parseProse(both);
    expect(parsed.append_to).toBe("new.prose.md");
    expect(parsed.mode).toBe("comment");
    expect(parsed.target).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

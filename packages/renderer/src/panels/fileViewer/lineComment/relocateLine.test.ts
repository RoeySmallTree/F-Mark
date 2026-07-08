import { describe, it, expect } from "vitest";
import { relocateLine } from "./relocateLine.js";
import { buildLineContext } from "./lineContext.js";
import type { LineContext } from "@f-mark/shared";

/* The comment was made on lines 3-4 of this original text. */
const ORIGINAL = ["import a", "import b", "const x = 1", "const y = 2", "doThing(x, y)"].join(
  "\n",
);
const STORED_LINES: [number, number] = [3, 4];
const CTX: LineContext = buildLineContext(ORIGINAL, STORED_LINES);

describe("relocateLine", () => {
  it("(a) STORED: unchanged file → stored start line, not drifted", () => {
    const res = relocateLine(ORIGINAL, CTX, STORED_LINES);
    expect(res).toEqual({ line: 3, method: "stored", drifted: false });
  });

  it("(b) EXACT: drift DOWN (lines inserted above) → relocated, not drifted", () => {
    const drifted = [
      "// new header",
      "// another",
      "import a",
      "import b",
      "const x = 1",
      "const y = 2",
      "doThing(x, y)",
    ].join("\n");
    const res = relocateLine(drifted, CTX, STORED_LINES);
    // selected block "const x = 1\nconst y = 2" now starts at line 5.
    expect(res.method).toBe("exact");
    expect(res.line).toBe(5);
    expect(res.drifted).toBe(false);
  });

  it("(b) EXACT: drift UP (lines removed above) → relocated to earlier line", () => {
    const drifted = ["import b", "const x = 1", "const y = 2", "doThing(x, y)"].join(
      "\n",
    );
    const res = relocateLine(drifted, CTX, STORED_LINES);
    // block now starts at line 2; stored start (3) no longer matches.
    expect(res.method).toBe("exact");
    expect(res.line).toBe(2);
    expect(res.drifted).toBe(false);
  });

  it("(c) CONTEXT: selected text edited but neighbors intact → context match", () => {
    // The selected lines changed (const x = 100), so exact fails; `before`
    // (import a / import b) still anchors the location.
    const edited = [
      "import a",
      "import b",
      "const x = 100",
      "const y = 200",
      "doThing(x, y)",
    ].join("\n");
    const res = relocateLine(edited, CTX, STORED_LINES);
    expect(res.method).toBe("context");
    // before block ends at line 2 → target is the line right after = 3.
    expect(res.line).toBe(3);
    expect(res.drifted).toBe(false);
  });

  it("(c) CONTEXT via AFTER: before missing, after snippet still present", () => {
    // A context whose `before` no longer matches but whose single-line `after`
    // ("doThing(x, y)") still anchors. The selection text itself changed, so
    // exact also fails — only the `after` neighbor locates it.
    const ctxWithAfter: LineContext = {
      selected: "const x = 1",
      before: "import a\nimport b",
      after: "doThing(x, y)",
      sha256: "deadbeef",
    };
    const edited = ["const X = 9", "doThing(x, y)"].join("\n");
    const res = relocateLine(edited, ctxWithAfter, [3, 3]);
    expect(res.method).toBe("context");
    // after block ("doThing(x, y)") is at line 2 → target is line 1.
    expect(res.line).toBe(1);
  });

  it("(d) FALLBACK: no match but stored start still in range → best-effort drifted", () => {
    const replaced = ["totally", "different", "file", "content", "here"].join("\n");
    const res = relocateLine(replaced, CTX, STORED_LINES);
    expect(res.method).toBe("fallback");
    expect(res.line).toBe(3); // stored start, still within 5 lines
    expect(res.drifted).toBe(true);
  });

  it("(e) NONE: no match and file shorter than stored start → reveal nothing", () => {
    const tiny = ["one line only"].join("\n");
    const res = relocateLine(tiny, CTX, STORED_LINES);
    expect(res).toEqual({ line: null, method: "none", drifted: true });
  });

  it("no line_context, only stored lines in range → fallback (best effort)", () => {
    const res = relocateLine(ORIGINAL, undefined, STORED_LINES);
    expect(res.method).toBe("fallback");
    expect(res.line).toBe(3);
    expect(res.drifted).toBe(true);
  });

  it("no line_context and stored start out of range → none", () => {
    const res = relocateLine("a\nb", undefined, [50, 50]);
    expect(res).toEqual({ line: null, method: "none", drifted: true });
  });

  it("exact match is preferred over a stale stored start (block moved within range)", () => {
    // Swap so the selected block sits at lines 1-2 instead of 3-4, but the file
    // is still >= 3 lines (so fallback would also be 'in range'). Exact wins.
    const moved = ["const x = 1", "const y = 2", "import a", "import b"].join("\n");
    const res = relocateLine(moved, CTX, STORED_LINES);
    expect(res.method).toBe("exact");
    expect(res.line).toBe(1);
    expect(res.drifted).toBe(false);
  });

  it("CRLF line endings normalize the same as LF", () => {
    const crlf = ORIGINAL.replace(/\n/g, "\r\n");
    const res = relocateLine(crlf, CTX, STORED_LINES);
    expect(res.method).toBe("stored");
    expect(res.line).toBe(3);
  });
});

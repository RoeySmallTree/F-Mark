/* Regression: opencode (and some MCP clients) fill OPTIONAL params with an
   empty string "" instead of omitting them. The kernel then forwarded
   `append_to: ""` to the prose route, which correctly rejects it
   ("append_to must be a non-empty filename") — so an opencode agent's very
   first `fmark_post_prose("Connected…")` failed. `optionalRef()` normalizes
   ""/whitespace → undefined for optional ref/name fields so these clients
   work, while leaving real values intact. (content="" is NOT one of these —
   header-only anchors legitimately use it.) */

import { describe, expect, test } from "vitest";
import { optionalRef } from "../../src/mcp/tools.js";

describe("optionalRef — empty optional strings become absent", () => {
  test("empty string → undefined", () => {
    expect(optionalRef().parse("")).toBeUndefined();
  });

  test("whitespace-only → undefined", () => {
    expect(optionalRef().parse("   ")).toBeUndefined();
  });

  test("undefined stays undefined", () => {
    expect(optionalRef().parse(undefined)).toBeUndefined();
  });

  test("a real value passes through unchanged", () => {
    expect(optionalRef().parse("doc.prose.md")).toBe("doc.prose.md");
  });
});

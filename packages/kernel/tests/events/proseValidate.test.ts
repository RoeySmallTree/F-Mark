import { describe, it, expect } from "vitest";
import { validateProseFrontmatter } from "../../src/events/proseValidate.js";

const VALID_FILENAME = "20260522T120000Z_ag-c92e.prose.md";
const ANOTHER_VALID = "20260523T120000Z_us-a7f3.flow.json";

function ok(result: ReturnType<typeof validateProseFrontmatter>): void {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
}
function err(
  result: ReturnType<typeof validateProseFrontmatter>,
  match?: string,
): void {
  if (result.ok) throw new Error("expected error, got ok");
  if (match !== undefined) {
    if (!result.error.toLowerCase().includes(match.toLowerCase())) {
      throw new Error(
        `error message "${result.error}" does not include "${match}"`,
      );
    }
  }
}

describe("validateProseFrontmatter — happy paths", () => {
  it("accepts a plain message (no append_to)", () => {
    ok(validateProseFrontmatter({ content: "hello" }));
  });

  it("accepts a named anchor (name, no append_to)", () => {
    ok(validateProseFrontmatter({ content: "", name: "Doc" }));
  });

  it("accepts a content block (append_to + no mode)", () => {
    ok(
      validateProseFrontmatter({
        content: "block body",
        append_to: VALID_FILENAME,
      }),
    );
  });

  it("accepts a named block (append_to + name)", () => {
    ok(
      validateProseFrontmatter({
        content: "sub body",
        append_to: VALID_FILENAME,
        name: "Sub-section",
      }),
    );
  });

  it("accepts a card-level comment (mode=comment, no lines)", () => {
    ok(
      validateProseFrontmatter({
        content: "good point",
        append_to: VALID_FILENAME,
        mode: "comment",
      }),
    );
  });

  it("accepts a line comment (mode=comment + lines)", () => {
    ok(
      validateProseFrontmatter({
        content: "nit",
        append_to: VALID_FILENAME,
        mode: "comment",
        lines: [1, 3],
      }),
    );
  });

  it("accepts a tombstone (append_to + removed=true + empty content)", () => {
    ok(
      validateProseFrontmatter({
        content: "",
        append_to: VALID_FILENAME,
        removed: true,
      }),
    );
  });

  it("accepts append_to with a non-prose-kind filename (e.g. .flow.json)", () => {
    /* `removed: true` requires empty content. */
    ok(
      validateProseFrontmatter({
        content: "",
        append_to: ANOTHER_VALID,
        removed: true,
      }),
    );
  });
});

describe("validateProseFrontmatter — mutual-exclusion rules", () => {
  it("rejects `mode` without `append_to`", () => {
    err(
      validateProseFrontmatter({ content: "x", mode: "comment" }),
      "requires `append_to`",
    );
  });

  it("rejects `mode === \"content\"` without `append_to`", () => {
    err(
      validateProseFrontmatter({ content: "x", mode: "content" }),
      "requires `append_to`",
    );
  });

  it("rejects `lines` with `mode !== \"comment\"`", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: VALID_FILENAME,
        mode: "content",
        lines: [1, 2],
      }),
      "lines",
    );
  });

  it("rejects `lines` without `mode` (and append_to set)", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: VALID_FILENAME,
        lines: [1, 2],
      }),
      "lines",
    );
  });

  it("rejects `lines` without `append_to`", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        lines: [1, 2],
      }),
      "lines",
    );
  });

  it("rejects `lines` with start <= 0", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: VALID_FILENAME,
        mode: "comment",
        lines: [0, 2],
      }),
      "positive integers",
    );
  });

  it("rejects `lines` with end < start", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: VALID_FILENAME,
        mode: "comment",
        lines: [5, 3],
      }),
      "start must be <= end",
    );
  });

  it("rejects `lines` with non-integer entries", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: VALID_FILENAME,
        mode: "comment",
        lines: [1.5, 3] as unknown as [number, number],
      }),
      "positive integers",
    );
  });

  it("rejects `lines` with wrong length", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: VALID_FILENAME,
        mode: "comment",
        lines: [1] as unknown as [number, number],
      }),
      "2-element",
    );
  });

  it("rejects `mode === \"comment\"` with `name` set", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: VALID_FILENAME,
        mode: "comment",
        name: "Title",
      }),
      "comments must not carry `name`",
    );
  });

  it("rejects `mode === \"comment\"` with `removed: true`", () => {
    err(
      validateProseFrontmatter({
        content: "",
        append_to: VALID_FILENAME,
        mode: "comment",
        removed: true,
      }),
      "comments cannot be tombstones",
    );
  });

  it("rejects `removed: true` with non-empty content", () => {
    err(
      validateProseFrontmatter({
        content: "still has content",
        append_to: VALID_FILENAME,
        removed: true,
      }),
      "empty content",
    );
  });

  it("accepts a file comment (file_path + lines, no append_to/mode)", () => {
    ok(
      validateProseFrontmatter({
        content: "this line looks off",
        file_path: "src/app.ts",
        lines: [10, 12],
      }),
    );
  });

  it("accepts a file comment with no lines (file-level)", () => {
    ok(
      validateProseFrontmatter({
        content: "whole-file note",
        file_path: "src/app.ts",
      }),
    );
  });

  it("rejects `file_path` combined with `append_to`/`mode`", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        file_path: "src/app.ts",
        append_to: VALID_FILENAME,
      }),
      "mutually exclusive",
    );
  });

  it("rejects `append_to === \"\"`", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: "",
      }),
      "non-empty",
    );
  });

  it("rejects `append_to` not matching event-filename pattern", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: "not-a-real-filename.md",
      }),
      "event-filename pattern",
    );
  });

  it("rejects `mode` enum mismatch", () => {
    err(
      validateProseFrontmatter({
        content: "x",
        append_to: VALID_FILENAME,
        mode: "bogus" as unknown as "content",
      }),
      "'content' or 'comment'",
    );
  });
});

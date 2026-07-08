import { describe, expect, it } from "vitest";
import { EVENT_KINDS, type AnyEventRecord } from "@f-mark/shared";
import {
  extractFileQuote,
  fileRefLabel,
  quoteForFileCommentAtLines,
  quoteFromEventTarget,
  quoteFromLineContext,
} from "../../src/comments/commentQuote.js";

describe("commentQuote", () => {
  it("quoteFromLineContext prefers selected text over hunk", () => {
    expect(
      quoteFromLineContext({
        content: "see this?",
        line_context: { selected: "import type { z }", sha256: "x" },
        diff_hunk: "@@ -1 +1 @@",
      }),
    ).toBe("import type { z }");
  });

  it("fileRefLabel includes line range", () => {
    expect(fileRefLabel("src/foo.ts", [3, 5])).toBe("foo.ts:3-5");
    expect(fileRefLabel("src/foo.ts", [3, 3])).toBe("foo.ts:3");
  });

  it("quoteFromEventTarget returns multi-line slice", () => {
    const target: AnyEventRecord = {
      filename: "doc.prose.md",
      kind: EVENT_KINDS.prose,
      participant_id: "us-local",
      timestamp: "2026-01-01T00:00:00.000Z",
      payload: { content: "one\ntwo\nthree\nfour" },
    };
    expect(quoteFromEventTarget(target, [2, 3])).toBe("two\nthree");
  });

  it("extractFileQuote uses bucket line_context", () => {
    const quote = extractFileQuote({
      comments: [],
      lineContext: { selected: "hello world", sha256: "abc" },
    });
    expect(quote).toBe("hello world");
  });

  it("extractFileQuote slices file text when line_context is missing", () => {
    const quote = extractFileQuote({
      comments: [],
      lines: [6, 6],
      fileText: "a\nb\nc\nd\n e\n# Local Any-Agent Rules Redirect\n",
    });
    expect(quote).toBe("# Local Any-Agent Rules Redirect");
  });

  it("quoteForFileCommentAtLines resolves from matching comment events + file text", () => {
    const quote = quoteForFileCommentAtLines({
      events: [
        {
          filename: "c1.prose.md",
          kind: EVENT_KINDS.prose,
          participant_id: "us-local",
          timestamp: "2026-01-01T00:00:00.000Z",
          payload: {
            content: "check this",
            file_path: "skills/SKILL.md",
            lines: [6, 6],
          },
        },
      ],
      filePath: "skills/SKILL.md",
      lines: [6, 6],
      fileText: "a\nb\nc\nd\n e\n# Local Any-Agent Rules Redirect\n",
    });
    expect(quote).toBe("# Local Any-Agent Rules Redirect");
  });
});

describe("buildFileCommentGroups quote wiring", () => {
  it("uses line_context.selected for file comment groups", async () => {
    const { buildCommentGroups } = await import(
      "../../src/panels/right/comments/commentModel.js"
    );
    const groups = buildCommentGroups([
      {
        filename: "c1.prose.md",
        kind: EVENT_KINDS.prose,
        participant_id: "us-local",
        timestamp: "2026-01-01T00:00:00.000Z",
        payload: {
          content: "check this",
          file_path: "SKILL.md",
          lines: [6, 6],
          line_context: { selected: "# Skill title", sha256: "x" },
        },
      },
    ]);
    expect(groups[0]?.quote).toBe("# Skill title");
  });
});

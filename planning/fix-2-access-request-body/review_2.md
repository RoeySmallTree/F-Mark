# Review 2 - Fix #2 Access Request Body

No new blocking findings. The follow-up is in good shape.

## Review 1 Disposition Check

1. **Missing keys for actual F-Mark MCP shapes: yes, fixed.** `ACCESS_REQUEST_MESSAGE_KEYS` now includes the previously called-out `html`, `path`, `filename`, `name`, and `tool_name` fields (`packages/kernel/src/hooks/autoStream.ts:131`). The new tests cover `fmark_post_html`, `fmark_post_file_ref`, and `fmark_post_tool_use` (`packages/kernel/tests/hooks/autoStream.test.ts:412`). Leaving `fmark_post_choice` on JSON preview is fine because the preview shows both `choices_id` and `selected`.
2. **Gemini fallback bypass: yes, fixed.** The Gemini branch now derives a detail message from `command`, `toolDisplayName`, `toolName`, or well-known detail keys before using the top-level message, and only uses `jsonPreview(details)` last (`packages/kernel/src/hooks/autoStream.ts:250`). The new Gemini tests cover both `toolDisplayName` precedence and top-level fallback (`packages/kernel/tests/hooks/autoStream.test.ts:376`).
3. **Circular refs in posted body: deferred, disposition is sound.** The comment now states the production `JSON.parse` assumption and that direct callers should pass plain data (`packages/kernel/src/hooks/autoStream.ts:138`). That is acceptable for this helper's current use.
4. **Truncation cosmetics/status-label/integration gaps: deferred, disposition is sound.** These are still real possible polish/test follow-ups, but they are outside the empty-body kernel fix.
5. **Inaccurate key-list comment: yes, fixed.** The comment now accurately describes the F-Mark fields, JSON preview fallback, and display-only nature of the cap (`packages/kernel/src/hooks/autoStream.ts:131`).

## New Notes

The `pickWellKnownMessageField` / `jsonPreview` split looks clean. It avoids letting Gemini's generic top-level message suppress useful structured details, while also avoiding an opaque JSON dump when a usable top-level message exists.

One non-blocking residual: Gemini `title` can still be the generic top-level message while `message` uses `toolDisplayName`; that is a title/UX issue, not a regression in the body fix.

Focused verification passed: `pnpm -F f-mark exec vitest run tests/hooks/autoStream.test.ts` -> 23 passed.

# Fix #2 — AccessRequest body for MCP tools

## Intent

The F-Mark `AccessRequestCard` shows only title + meta and no body for `mcp__fmark__fmark_post_prose` (per the screenshot). Root cause: `extractAccessRequest` derives `message: command ?? stringField(toolInput, "description")` and the `tool_input` for fmark MCP tools has neither field. The renderer's body branch checks `command`/`message`/null, so the card renders empty.

Fix the extractor so every tool's permission card has a meaningful body preview.

## Strategy

Kernel-only, no schema changes. Renderer is untouched (its `<pre>command</pre>` and `<p>message</p>` branches are correct — the bug is upstream).

- Add a chained fallback in `extractAccessRequest` (`packages/kernel/src/hooks/autoStream.ts`):
  1. Keep `command ?? toolInput.description` as the first source of truth (Bash-style and existing tools).
  2. If both are absent, try `tool_input` keys in this priority order: `content`, `text`, `title`, `prompt`, `body`, `message`, `question` — matches every fmark MCP tool's payload (`post_prose.content`, `post_todo.title`, `post_choices.question`, `post_html.body`, etc.).
  3. If none match, fall back to a JSON-stringified preview of `tool_input`, capped at 800 chars with a trailing `…`.
- Apply the same fallback to the Gemini Notification → ToolPermission branch (for `details` payloads).
- Export `extractAccessRequest` from `autoStream.ts` so we can unit-test it as a pure function (matches the test-from-runAutoStream pattern but avoids the access-response polling loop).

## Files changed

- `packages/kernel/src/hooks/autoStream.ts` — new `ACCESS_REQUEST_MESSAGE_KEYS` constant + `pickAccessRequestMessage` helper, wired into both branches of `extractAccessRequest`. Function is now exported.
- `packages/kernel/tests/hooks/autoStream.test.ts` — 8 new tests for `extractAccessRequest` covering: prose content, todo title, choices question, JSON fallback, JSON size cap, Bash command (no regression), description-only, Gemini Notification → ToolPermission with details.command, null for unrelated events.
- `packages/renderer/tests/cards/accessRequest.test.tsx` — **new file**, 6 tests covering the three body-rendering branches (command/message/neither) plus approve/deny callback wiring and the responded-state hidden-buttons case. No prior AccessRequestCard coverage existed.

## Intentional non-goals

- Not adding per-tool body resolvers keyed on `tool_name`. The generic priority list covers every current fmark MCP tool and stays robust if MCP shapes evolve. A per-tool table would be brittle.
- Not changing the renderer's body-rendering logic. The two-branch `command` → `<pre>` / `message` → `<p>` rendering is correct; the kernel now feeds the right `message`.
- Not changing the rendered card layout, styling, or the way `tool_name` shows up as the title.

## Open risks / known gaps

- A tool whose meaningful field is keyed differently than the seven well-known keys still gets the JSON preview. Acceptable: the user sees structured data instead of nothing.
- JSON.stringify on `tool_input` with a circular reference would throw — guarded by try/catch, returns `undefined`, which falls back to the no-body render path. Acceptable.
- The 800-char limit is arbitrary; tuned to fit a typical access-request card without blowing up event JSON. If this proves too low for any tool, raise it.

## Tests

`pnpm -F f-mark exec vitest run tests/hooks/autoStream.test.ts` → 17 passed.
`pnpm -F @f-mark/renderer exec vitest run tests/cards/accessRequest.test.tsx` → 6 passed.

## What I want reviewed

1. **Key priority order.** Is `content > text > title > prompt > body > message > question` the right fallback order for the fmark MCP surface? Any tool I missed where the priority should be different?
2. **JSON preview escape hatch.** Should the JSON preview be wrapped in a `<pre>` (treated like `command`) or `<p>` (treated like `message`)? Today it routes via `message` → `<p>` because that's where the fallback lands. Trade-offs?
3. **Gemini branch symmetry.** The Notification → ToolPermission branch passes `details` to `pickAccessRequestMessage`; does it behave correctly for actual Gemini ToolPermission shapes?
4. **Export of `extractAccessRequest`.** Acceptable to widen the export surface for unit testing, or would you prefer testing through `runAutoStream`? The end-to-end route requires either a fake access-response writer or a short polling timeout.

## Disposition of review_1.md findings

1. **Missing keys for actual fmark MCP shapes → FIXED.** Added `html`, `path`, `filename`, `name`, `tool_name` to `ACCESS_REQUEST_MESSAGE_KEYS`. Removed the misleading "html → body" comment. Added 4 new kernel tests: `fmark_post_html` (uses `html`), `fmark_post_file_ref` (uses `path`), `fmark_post_tool_use` (uses `tool_name`), null/undefined `tool_input` returns no message.
2. **Gemini bypass of fallback → FIXED.** Split `pickAccessRequestMessage` into `pickWellKnownMessageField` (strict) and `jsonPreview` (opaque). The Gemini branch now tries `details.toolDisplayName` → `details.toolName` → well-known keys on details FIRST, then falls back to the top-level `message`, and only as last resort dumps a JSON preview. Two new tests: generic top-level Gemini message no longer wins over `toolDisplayName`; top-level message is used when details has no useful field but JSON preview is the absolute last fallback.
3. **Circular refs in posted body → DEFERRED w/ comment.** Production hook stdin is `JSON.parse`d, so circular refs can't occur. Documented the assumption in the new comment block.
4. **Truncation cosmetics, status-label & integration-test gaps → DEFERRED.** Out of scope for the empty-body fix. Worth dedicated coverage in a separate AccessRequestCard test pass.
5. **Inaccurate comment on the key list → FIXED.** Rewrote the comment block to accurately describe coverage and the JSON-preview escape hatch.

`pnpm -F f-mark exec vitest run tests/hooks/autoStream.test.ts` → 23 passed (8 existing + 15 new across both rounds).

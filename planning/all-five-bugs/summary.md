# Five F-Mark bugs — cross-cutting summary

Five issues surfaced from a real session. Each was diagnosed, fixed, and reviewed by Codex twice (round one + verify) in its own `planning/<fix>/` folder. This document is the cumulative view.

## What was wrong

1. **Comment context lost.** Wake packet carried only a 240-char `summary` of the comment text; agents had no way to recognise it was anchored to lines of a parent prose.
2. **Empty `AccessRequestCard` body.** Kernel-side `extractAccessRequest` looked only for `command`/`description` in `tool_input`; fmark MCP shapes (`content`/`title`/`question`/etc.) fell through to undefined → renderer showed only title + meta.
3. **Every fmark MCP call prompted.** `mcpInstall/claude.ts` registered `mcpServers.fmark` but never touched `permissions.allow`; Claude prompted for every one of the ~20 tools.
4. **Agent woken before turn-end.** `Compose.submit()` called `wakeSession` unconditionally on Send in message mode, regardless of `messageEndsTurn` or whether the user was still drafting.
5. **Hook only captured MCP-emitted output.** Only `Stop`+`PermissionRequest` hooks installed; tool calls landed in the feed only at end-of-turn. PermissionRequest interrupts from #3 further delayed Stop. Thinking blocks intentionally dropped.

## How they interact

`#3 → #5` is the load-bearing path: silencing fmark MCP prompts (#3) lets the agent's turn finish promptly, which unblocks Stop-time tool-use capture. #5 then adds live `PostToolUse` streaming so the user sees tool calls as they happen.

`#3 → #2`: once fmark MCP calls are silent, the empty-body access cards (#2) mostly disappear in practice. The #2 fix still matters for non-fmark MCP servers and for non-Claude runtimes.

`#1` and `#4` are independent.

## What was changed

| Bug | Files | New tests |
|---|---|---|
| #1 | `packages/shared/src/compass.ts`, `packages/kernel/src/compass/packet.ts`, `packages/kernel/src/routes/guide.ts` | 13 packet tests + 1 guide test |
| #2 | `packages/kernel/src/hooks/autoStream.ts` | 15 extractor tests + 6 AccessRequestCard tests |
| #3 | `packages/kernel/src/mcp/tools.ts`, `packages/kernel/src/mcpInstall/{claude,codex,gemini}.ts` | 1 mcp/tools sync test + 9 mcpInstall/claude tests |
| #4 | `packages/renderer/src/compose/Compose.tsx` | 5 wake-gating tests |
| #5 | `packages/kernel/src/hooksInstall/{claude,command}.ts`, `packages/kernel/src/hooks/{autoStream,transcript}.ts`, plus fixture updates in `phase16-access-requests-hot.mjs` and `reconcile.test.ts` | 16 extract/dedup tests |

## Decisions worth flagging

- **#1:** `CompassPacketEvent` now carries optional `append_to`/`mode`/`lines` (shared type change → required `pnpm -F @f-mark/shared build`). Guard `isValidLines` rejects `NaN`/`Infinity`/negative/reversed.
- **#3:** Allow-list scope follows the MCP scope. `project` and `local` write to `<projectRoot>/.claude/settings.local.json`; `user` writes to `~/.claude/settings.json`. Drift detection unions across all three settings files (Claude merges them at runtime). Preflight validation rejects malformed JSON before mutating `.mcp.json`.
- **#5:** `FMARK_HOOK_INSTALL_VERSION` bumped `managed-only-v1` → `managed-only-v2`. v1 installs detect as "stale" until the user re-applies. `extractPostToolUseEvent` skips `mcp__fmark__*` (already posted by the MCP server) and Claude subagent tools (`agent`/`task`). Stop-time dedup keyed on `tool_use_id`.
- **Codex / Gemini:** no per-tool allow-list equivalent to Claude's. Added doc-only comments in `mcpInstall/{codex,gemini}.ts` explaining why we don't touch them.

## Cross-cutting verification

`pnpm -F @f-mark/shared build && pnpm -F f-mark test` → **669 passed across 91 files** (after the cumulative-review fix that drops `mcp__fmark__*` from Stop-time tool-use projection too).

`pnpm -F @f-mark/renderer exec vitest run tests/compose.test.tsx tests/cards/accessRequest.test.tsx tests/cards/event-card.test.tsx tests/cards/message.test.tsx tests/cards/prose.test.tsx` → **56 passed across 5 files.**

Pre-existing renderer test failures (around 20) involve `PixelBlast`/WebGL contexts in jsdom — these are unrelated to the five fixes (none of my files touch `LoadingAnimation.tsx`/`PixelBlast.tsx` or their direct callers).

## Cumulative review finding

`planning/all-five-bugs/review.md` flagged one cross-cutting issue and it's now fixed:

**Stop-time `mcp__fmark__*` suppression.** Live `PostToolUse` filtered fmark MCP tools, but Stop's transcript projection still emitted a generic tool-use card for `mcp__fmark__fmark_post_prose` etc. — redundant with the structured prose/todo events the MCP server writes itself. `dedupeHookFinalProse` now drops any tool-use whose `tool_name` starts with `mcp__fmark__`. New test exercises an `fmark_post_prose` tool_use in the transcript and confirms zero `/events/tool-use` POSTs at Stop (just the concluding prose + turn-end).

## Manual smoke (recommended, not run here)

1. `pnpm -F f-mark dev` → Apply-and-Launch Claude at project scope. Verify:
   - `.claude/settings.local.json` now contains 20 `mcp__fmark__*` entries in `permissions.allow`.
   - `.claude/settings.json` (or equivalent) contains `Stop`, `PermissionRequest`, and `PostToolUse` hooks.
2. Spawn a Claude managed agent. Ask it to post a prose + a todo + a choices block. **Expected:** zero permission prompts in Claude Code.
3. Use the agent's Read/Bash tools. **Expected:** `tool-use` events appear in the F-Mark feed as the calls complete, not only at Stop.
4. From Compose, disable "message ends turn." Send a message. **Expected:** no `/wake` in kernel logs. Click End-Turn button → wake fires.
5. Comment on lines 5-8 of a long prose. **Expected:** agent's wake packet (visible in the agent's tmux pane) shows `append_to`, `lines`, and `comment on … @5-8: …` summary. Agent's response references the anchored text.
6. Manually post an access-request for a non-fmark tool whose input has `content` → **Expected:** AccessRequestCard renders the content as the body, not empty.

## Per-bug paper trail

- `planning/fix-3-silent-fmark-mcp/` — summary + review_1 + review_2
- `planning/fix-4-wake-gating/` — summary + review_1 + review_2
- `planning/fix-2-access-request-body/` — summary + review_1 + review_2
- `planning/fix-1-comment-context/` — summary + review_1 + review_2
- `planning/fix-5-postooluse/` — summary + review_1 + review_2

All 10 Codex reviews returned with "no new blocking findings" by the second pass. Findings from review_1 in each fix were either fixed (most) or deferred with documented rationale.

# Final cross-cutting review

## Verdict

The five fixes mostly compose well. Comment-anchor metadata, wake gating, access-request body fallback, Claude MCP allow-listing, and live `PostToolUse` streaming are aligned at the API boundaries I checked.

I would fix one cumulative gap before calling the v2 bundle fully shipped.

## Finding

1. **Medium: `mcp__fmark__*` suppression is live-only; Stop can still emit the duplicate/noisy F-Mark MCP tool-use card.**

   `extractPostToolUseEvent` drops `mcp__fmark__*` during live `PostToolUse` capture because the MCP server writes the real structured event (`packages/kernel/src/hooks/autoStream.ts:672-734`). But the Stop path still projects transcript tool blocks through `projectTurnToEvents`, then `dedupeHookFinalProse` only removes tool-use events whose `tool_use_id` was already recorded, plus matching final prose (`packages/kernel/src/hooks/autoStream.ts:856-900`, `packages/kernel/src/hooks/autoStream.ts:1092-1106`). There is no equivalent Stop-time `mcp__fmark__*` suppression.

   Impact: an agent replying to a line comment with `fmark_post_prose` correctly writes the anchored prose reply with `append_to`/`mode`/`lines`, but Stop can append an unanchored generic `tool-use` event for `mcp__fmark__fmark_post_prose`. That partially defeats #5's duplicate-avoidance rationale and can crowd later wake packets with less useful metadata than the structured prose event from #1.

   Suggested fix: apply the same F-Mark MCP exclusion before Stop posts projected `tool-use` events, or make the dedupe aware of structured F-Mark MCP writes. Add a regression test: `fmark_post_prose` comment reply with `append_to`/`lines` followed by Stop should leave the anchored prose event and turn-end, but no generic `mcp__fmark__fmark_post_prose` tool-use card.

## Interactions Checked

- **#5 with #1:** good apart from the finding above. The structured prose event carries `append_to`, `mode`, and validated `lines`; `packetEvent` only propagates those for prose, so unrelated live tool-use events do not get bogus anchor fields.
- **#4 mentions:** the current semantics are coherent: selected mentions wake targeted agents even when `messageEndsTurn` is off; non-mentioned sends wake only when the message ends the turn; empty End Turn wakes broadly after a real turn-end post.
- **#2 with Stop flow:** good. `extractAccessRequest` runs before the assistant `PostToolUse`/Stop branch and returns after handling a permission request, so a PermissionRequest payload with `transcript_path` should not fall through into Stop projection.

## Test Surface

Add the Stop-time F-Mark MCP suppression test above. I would also add two small cross tests, not as blockers:

- PermissionRequest with `transcript_path` and an F-Mark-shaped body posts an access request body and no prose/tool-use/turn-end.
- Compose send with both a selected mention and `messageEndsTurn=true` documents the intended one targeted `mention` wake plus a turn-end, with no broad duplicate wake.

## Architecture

The bundle is pushing more behavior through string conventions (`mcp__fmark__*`, Claude hook names, and multiple Claude settings files). That is acceptable for v2, but the next cleanup should centralize F-Mark MCP tool classification into read/write/self-emitting categories instead of hard-coding the prefix in hook code.

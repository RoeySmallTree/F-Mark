# Review 2 - Fix #3 Silent fmark MCP

Narrow tests pass:

`pnpm -F f-mark exec vitest run tests/mcpInstall/claude.test.ts tests/mcp/tools.test.ts tests/mcpInstall/integration.test.ts tests/mcpInstall/types.test.ts`

Result: 4 files, 22 tests passed.

## Prior Findings

1. **Merged-source drift detection: YES.** `inspectClaudeAllowEntries` now unions `~/.claude/settings.json`, `<projectRoot>/.claude/settings.json`, and `<projectRoot>/.claude/settings.local.json` before deciding entries are missing (`packages/kernel/src/mcpInstall/claude.ts:50`, `packages/kernel/src/mcpInstall/claude.ts:92`). Both top-level and local detect paths use it. Small coverage gap: the test exercises user-global settings, but not shared project `.claude/settings.json`.

2. **Malformed permission files: PARTIAL.** Invalid JSON/read errors now block detection and preflight before MCP registration, so the original invalid-JSON partial-install bug is fixed (`packages/kernel/src/mcpInstall/claude.ts:66`, `packages/kernel/src/mcpInstall/claude.ts:113`, `packages/kernel/src/mcpInstall/claude.ts:411`). But a top-level non-object settings file, such as `[]`, is still treated as valid/empty by `readClaudePermissionsValue` + `allowEntriesFromValue` (`packages/kernel/src/mcpInstall/claude.ts:66`, `packages/kernel/src/mcpInstall/claude.ts:73`). Detect reports safe `stale`, preflight passes, then `applyClaudeAllowList` rejects via `readJsonObjectForWrite` after `.mcp.json` / `~/.claude.json` may already be mutated (`packages/kernel/src/mcpInstall/claude.ts:125`, `packages/kernel/src/mcpInstall/claude.ts:418`). Add top-level object validation and a regression test for this case.

3. **User-scope global blast radius: DEFERRED, sane.** The disposition matches the stated product decision, and the inline comment documents the risk and the exact-entry mitigation (`packages/kernel/src/mcpInstall/claude.ts:438`).

4. **`.claude/settings.local.json` gitignore handling: DEFERRED, sane.** This remains a real operational footgun in some repos, but the disposition is reasonable for this scoped fix.

5. **Concurrent settings edit race: DEFERRED, sane.** Still present, still consistent with the existing JSON write pattern, and not newly worsened by the latest changes.

## Second-Read Notes

No new regression jumped out beyond the remaining top-level non-object malformed-settings edge case above. The static tool list is covered by the sync test, idempotency/non-fmark preservation coverage is good, and Codex/Gemini remain comment-only.

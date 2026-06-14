# Review 1 - Fix #3 Silent fmark MCP

Scope note: `git diff HEAD -- packages/kernel/src/mcp/tools.ts packages/kernel/src/mcpInstall/claude.ts packages/kernel/src/mcpInstall/codex.ts packages/kernel/src/mcpInstall/gemini.ts packages/kernel/tests/mcp/tools.test.ts packages/kernel/tests/mcpInstall/claude.test.ts` produced no patch in this checkout because those paths are currently untracked. I reviewed the actual file contents directly. Narrow tests passed:

`pnpm -F f-mark exec vitest run tests/mcpInstall/claude.test.ts tests/mcp/tools.test.ts tests/mcpInstall/integration.test.ts tests/mcpInstall/types.test.ts`

## Findings

1. **Correctness: permission drift detection ignores Claude's merged settings sources.**
   `detectClaudeJson` checks only the file returned by `claudePermissionsPath(scope, projectRoot, env)` (`packages/kernel/src/mcpInstall/claude.ts:136-139`), and `detectClaudeLocalJson` does the same for local (`packages/kernel/src/mcpInstall/claude.ts:200-203`). Claude settings merge across user, project, and local settings, with arrays concatenated, so a project can already be promptless because `permissions.allow` exists in `~/.claude/settings.json` or `.claude/settings.json` even when `.claude/settings.local.json` is missing. This will mark an installed setup as `stale` and prompt Apply unnecessarily; for user-scope MCP, the inverse can happen too if the current project/local settings already allow the server. Suggest computing the effective allow set from `~/.claude/settings.json`, `<projectRoot>/.claude/settings.json`, and `<projectRoot>/.claude/settings.local.json` for detection, then choosing a write target only when entries are genuinely missing from all applicable sources. Add tests where the allow list is present in user settings and project settings but absent from `.local`.

2. **Correctness/UX: malformed permission settings are reported as safely auto-applicable stale state.**
   `readClaudePermissionsValue` collapses any read/parse failure to `null` (`packages/kernel/src/mcpInstall/claude.ts:76-79`), so invalid JSON or an unreadable permissions file becomes "all entries missing" and returns `status: "stale"` with `safe_auto_apply: true` (`packages/kernel/src/mcpInstall/claude.ts:140-148`, `packages/kernel/src/mcpInstall/claude.ts:204-212`). But `applyClaudeAllowList` will then throw on the same file (`packages/kernel/src/mcpInstall/claude.ts:50-53`). In project scope this happens after `.mcp.json` and `~/.claude.json` have already been mutated (`packages/kernel/src/mcpInstall/claude.ts:334-343`), leaving a partial install behind. Suggest making permissions-file read return a blocked result on invalid JSON / non-object top level, and validate the allow-list target before writing the MCP server registration. Add tests for invalid JSON, non-object top-level JSON, and unreadable settings files.

3. **Security/design: user-scope allow entries have a global server-name blast radius.**
   User apply writes the allow list to `~/.claude/settings.json` (`packages/kernel/src/mcpInstall/claude.ts:38-40`, `packages/kernel/src/mcpInstall/claude.ts:353-360`). Claude MCP permission rules are keyed by server name/tool name, not by the configured command/path, so these rules can auto-approve any MCP server named `fmark` with matching tool names in any project. A hostile `projectRoot` string does not appear to create JSON or shell injection here because values are JSON-stringified and command args are arrays; the real risk is a future or project-scoped server-name collision. Keeping exact entries (`mcp__fmark__fmark_post_prose`, etc.) is safer than a wildcard in the global file, but consider making global allow-list installation explicit in UI/copy or setting `safe_auto_apply: false` for the user permission expansion.

4. **Correctness/operational: project/local apply creates `.claude/settings.local.json` but does not ensure it is ignored.**
   The comment says project/local permissions go to `<projectRoot>/.claude/settings.local.json` because it is gitignored (`packages/kernel/src/mcpInstall/claude.ts:20-31`), and the code creates that file directly (`packages/kernel/src/mcpInstall/claude.ts:41`, `packages/kernel/src/mcpInstall/claude.ts:61`). Claude Code auto-ignores that file when Claude creates it, but F-Mark is bypassing Claude's creator path. In repos without a global exclude or existing ignore entry, this can leave a new local permission file as untracked WIP and make accidental commits more likely. Suggest either ensuring `.claude/settings.local.json` is ignored via `.git/info/exclude` when F-Mark creates it, or deliberately using `.claude/settings.json` for project-scoped shared permissions and documenting that trade-off.

5. **Race condition: allow-list writes can clobber concurrent settings edits.**
   `applyClaudeAllowList` does a read/merge/write with no mtime check or retry (`packages/kernel/src/mcpInstall/claude.ts:49-61`). That matches the existing JSON helper style, but the new target files are Claude settings files that Claude Code itself may rewrite while the setup modal is open. A concurrent `/permissions` save or another F-Mark setup could be lost. This is probably not a release blocker if the rest of `mcpInstall` accepts the same risk, but it is worth a regression test or a helper improvement: re-read before write if the file changed, or write through a compare/retry merge.

## Design Notes

- **Scope-to-file mapping:** Writing project/local permissions to `.claude/settings.local.json` is defensible if the permission grant is considered per-user trust, even when the MCP server definition lives in shared `.mcp.json`. It avoids silently granting every teammate promptless write-like F-Mark tools. If the product goal is "project install means everyone gets silent F-Mark," then `.claude/settings.json` is the matching shared settings file, but that has a larger security blast radius and should be intentional.
- **Wildcard vs enumeration:** Claude supports `mcp__fmark` / `mcp__fmark__*`-style rules for all tools on a server. A wildcard better matches the stated "any `mcp__fmark__*`" intent and removes drift, but it also grants future tools automatically. Given this server exposes write-like tools and process-spawning `fmark_fork_session`, enumerating the current tool surface is the safer default, especially for `~/.claude/settings.json`.
- **Layering:** `FMARK_MCP_TOOL_NAMES` belongs near `registerFmarkMcpTools` (`packages/kernel/src/mcp/tools.ts:18-39`). `FMARK_CLAUDE_ALLOW_ENTRIES` (`packages/kernel/src/mcp/tools.ts:41-43`) is Claude-specific; I would derive that in `mcpInstall/claude.ts` from the generic tool names unless other vendors need the same formatted strings.

## Tests To Add

- Detect installed project MCP as `installed` when allow entries are in `.claude/settings.json` or `~/.claude/settings.json`, not `.claude/settings.local.json`.
- Detect user-scope MCP drift/completeness explicitly; current new coverage exercises user apply only (`packages/kernel/tests/mcpInstall/claude.test.ts:178-201`).
- Detect/report blocked for malformed `.claude/settings.local.json` and malformed `~/.claude/settings.json`; do not show safe Apply.
- Apply twice and assert the second result has `changed: false` and does not reorder or duplicate non-fmark string entries.
- Local scope apply/detect coverage, since project and local share the permission file but different MCP registration locations.
- Optional concurrency test around two parallel allow-list merges or a simulated intervening settings write.

## Regression/Style Checks

- The new `env` parameter on `detectClaudeJson` is internal and optional (`packages/kernel/src/mcpInstall/claude.ts:82-89`); exported `detectClaudeMcp` passes `input.env` at both call sites (`packages/kernel/src/mcpInstall/claude.ts:228-243`). I do not see an external-caller regression, and callers that omit `env` would merely skip the new permission check.
- `applyClaudeAllowList` is idempotent for string allow entries and preserves existing non-fmark strings (`packages/kernel/src/mcpInstall/claude.ts:55-60`). It drops non-string array entries; if those are considered malformed settings, blocking is better than silently rewriting them.
- Codex and Gemini changes are comment-only and align with the existing behavior (`packages/kernel/src/mcpInstall/codex.ts:115-120`, `packages/kernel/src/mcpInstall/gemini.ts:57-63`).

Docs checked for the Claude-specific assumptions:

- Settings source locations and merge behavior: https://code.claude.com/docs/en/settings
- MCP scopes and storage locations: https://code.claude.com/docs/en/mcp
- MCP permission rule syntax and wildcard support: https://code.claude.com/docs/en/permissions

# Fix #3 — Silent fmark MCP (Claude allow list)

## Intent

When F-Mark installs its MCP server into Claude Code, the agent should be able to call any `mcp__fmark__*` tool without prompting the user for permission. Today the install only writes `mcpServers.fmark` to `.mcp.json` or `~/.claude.json`; nothing adds entries to `permissions.allow`, so Claude prompts for every one of the ~20 fmark MCP tools on first use. Three are partially whitelisted in this repo's `.claude/settings.local.json` by hand; the other 17 still prompt.

## Strategy

- Canonical tool name list lives in `packages/kernel/src/mcp/tools.ts` next to the registrations (`FMARK_MCP_TOOL_NAMES`), with derived `FMARK_CLAUDE_ALLOW_ENTRIES` (`mcp__fmark__<name>`). A sync test asserts the static list matches the `registerTool` calls.
- `packages/kernel/src/mcpInstall/claude.ts`:
  - New helper `claudePermissionsPath(scope, projectRoot, env)` resolves the settings file: project + local → `<projectRoot>/.claude/settings.local.json`; user → `~/.claude/settings.json`. Matches the existing convention this repo already follows.
  - New `applyClaudeAllowList(scope, projectRoot, env)` merges every `FMARK_CLAUDE_ALLOW_ENTRIES` entry idempotently into `permissions.allow` at that path. Preserves any non-fmark entries.
  - `applyClaudeMcp` now also calls `applyClaudeAllowList` for each of the three scopes (`project`, `user`, `local`) and ORs the changed bit.
  - `detectClaudeJson` and `detectClaudeLocalJson` now report `stale` (with a clear reason mentioning `permissions.allow`) when the MCP server is installed but the allow-list is incomplete. The IntegrationSetupModal already surfaces stale → "Apply" so the fix is one click.
- Codex and Gemini install modules get a single explanatory comment block — no behavior change. Codex has no per-tool allow-list concept; Gemini's `trust: false` is intentional and enforced.

## Files changed

- `packages/kernel/src/mcp/tools.ts` — exported `FMARK_MCP_TOOL_NAMES` + `FMARK_CLAUDE_ALLOW_ENTRIES`.
- `packages/kernel/src/mcpInstall/claude.ts` — helpers, detect drift, apply allow list.
- `packages/kernel/src/mcpInstall/codex.ts` — comment only.
- `packages/kernel/src/mcpInstall/gemini.ts` — comment only.
- `packages/kernel/tests/mcp/tools.test.ts` — sync test.
- `packages/kernel/tests/mcpInstall/claude.test.ts` — 4 new tests: project apply writes allow, preserves existing entries, user apply writes to `~/.claude/settings.json`, detect reports stale when missing.

## Tests

`pnpm -F f-mark exec vitest run tests/mcpInstall/claude.test.ts tests/mcp/tools.test.ts tests/mcpInstall/integration.test.ts tests/mcpInstall/types.test.ts` → 16 passed (5 new + 11 existing).

## What I want reviewed

1. **Correctness of scope-to-settings-file mapping.** Is `.claude/settings.local.json` the right destination for `project` and `local` scopes, or should `project` write to the shared `.claude/settings.json` instead?
2. **Drift detection wording.** Does the `stale` reason string read clearly to a user who sees it in the IntegrationSetupModal?
3. **Idempotency.** Confirm `applyClaudeAllowList` cannot duplicate entries and cannot drop existing non-fmark entries.
4. **`detectClaudeJson` change.** Now requires `env` for permissions checks — confirm no other callers pass it `undefined` unsafely.
5. **The static `FMARK_MCP_TOOL_NAMES` list.** Sync test should keep it honest, but is a static export with a test better than a dynamic capture? Trade-offs?

## Disposition of review_1.md findings

1. **Drift detection ignores merged sources → FIXED.** New `inspectClaudeAllowEntries` unions allow entries across `~/.claude/settings.json`, `<projectRoot>/.claude/settings.json`, and `<projectRoot>/.claude/settings.local.json`. Both `detectClaudeJson` and `detectClaudeLocalJson` use it. New test confirms allow entries in user-global settings are treated as effective for project scope.
2. **Malformed permission files → FIXED.** `readClaudePermissionsValue` now returns a discriminated `{kind:"missing"|"valid"|"invalid"}`. `inspectClaudeAllowEntries` surfaces invalid as a typed result; detect maps that to `status:"blocked"` with `safe_auto_apply:false`. `applyClaudeMcp` calls `preflightClaudePermissionFiles` BEFORE any mutation, so a corrupt file throws cleanly without leaving a half-installed `.mcp.json`. New tests: blocked detect on malformed `.local`; apply preflight throws and does not create `.mcp.json`.
3. **User-scope global blast radius → DEFERRED (commented).** User explicitly chose "match the MCP-server scope". Added an inline comment in `applyClaudeMcp` explaining the intentional blast radius and why we enumerate exact entries rather than a wildcard. Decision documented.
4. **`.claude/settings.local.json` gitignore → DEFERRED.** Cross-cutting policy: F-Mark's own `.claude/settings.local.json` is gitignored in this repo; most modern Claude-Code-using repos already gitignore it. Mutating `.git/info/exclude` is invasive and project-policy-coupled. Out of scope for this fix.
5. **Race condition on concurrent settings edits → DEFERRED.** Matches existing pattern in `applyClaudeTopLevel` / `applyClaudeLocal`. Not a new regression. Worth a dedicated change if it bites in practice.

## Additional tests added

- Allow entries in `~/.claude/settings.json` are treated as effective for project detect.
- Detect blocks (not stale) on malformed `.local` settings; `safe_auto_apply: false`.
- Apply preflight throws on malformed settings without mutating `.mcp.json`.
- Apply twice is idempotent (`changed: false` on the second run).
- Existing non-fmark allow entries are preserved verbatim and stay before the fmark entries.
- Local scope apply+detect round-trips.

All 19 mcpInstall + mcp tests pass.

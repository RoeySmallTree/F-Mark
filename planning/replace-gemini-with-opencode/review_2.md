# Review 2: replace Gemini with opencode

## Bottom Line

The revised plan is much stronger: the major architectural corrections from `review_1.md` are present, and the ADD-then-E2E-then-DELETE ordering is the right shape.

I would begin Phase 0 hot-testing, but I would **not** begin Phase 1 until the plan body is patched for the kernel HTTP route mismatches and hook-install scope plumbing below. Those are plan bugs, not opencode unknowns.

## Disposition Audit

| # | Disposition | Notes |
|---|-------------|-------|
| 1 | Lands | Assistant prose moved to `event` hook + A0 blocker. Still needs accumulator/dedupe design if A0 yields deltas only. |
| 2 | Partial | Sync permission flow is now v1, but template polls the wrong kernel route/query shape. |
| 3 | Lands | `statusFromOpencodeServer` checks `environment` then `env`. |
| 4 | Missing in sample | The text says mirror `autoStream`, but template uses nonexistent `GET /sessions/:id`, does not use global state dir, and latest fallback parses `/sessions` incorrectly. |
| 5 | Lands | Re-ran the requested `rg -l`; the plan's blast-radius lists cover the current package hits, excluding dist/tsbuildinfo/node_modules. |
| 6 | Lands | Sidecar metadata replaces comment-marker detection. |
| 7 | Partial | `applyOpencodeHooks` has explicit scope, but integration plumbing still maps to Claude-style `local/global` unless revised. |
| 8 | Lands | A10 uses positional `opencode run --format json "hello"`. |
| 9 | Lands | Capabilities are less pessimistic and A20 verifies slash behavior. |
| 10 | Partial | JSONC comment stripping handles `//` inside strings and escaped quotes, but not trailing commas; `.json` with comments remains undecided. |
| 11 | Lands | Deletion is after hot E2E. Triage says "Phase 9"; body has deletion in Phase 8 after Phase 7 E2E, which is fine but the numbering note is stale. |
| 12 | Lands | `turnHasContent` is keyed by opencode session ID, not F-Mark sid. |
| 13 | Lands | A17 covers MCP tool naming. |
| 14 | Lands | Hardcoded `success: true` is gone; Phase 0 must refine inference. |
| 15 | Partial | A19 hot-test exists, but no concrete install step writes `opencode.json[c].plugin` if auto-load fails. |
| 16 | Lands | A18 covers config precedence. |
| 17 | Lands | Template typecheck uses local bundled SDK. |
| 18 | Lands | E2E separates presence from active-session linkage. |
| 19 | Partial | `scanner.ts` update is planned, but no explicit `.opencode/skills` discovery test lands in Phase 7 despite the triage note. |
| 20 | Lands | Direct plugin + helper remains the chosen architecture. |
| 21 | Lands | TS-heavy phases now include typecheck gates. |
| 22 | Lands | Final grep gate is present and excludes generated noise. |

## New Issues

1. **Plugin HTTP route assumptions are wrong.**  
   `packages/kernel/src/routes/sessions.ts` has `GET /sessions` and `POST /sessions`, but no `GET /sessions/:id`. The template's `httpJson<{ exists: boolean }>(..., "/sessions/${v}")` will 404. Also `GET /sessions` returns `{ sessions: [...] }`, not an array, so `list?.[0]?.id` will never work.

2. **Access-response polling query shape is wrong.**  
   `packages/kernel/src/routes/events.ts` exposes `GET /sessions/:id/events?kinds=access-response` and returns `{ events }`. The plan polls `?kind=access-response` and treats the response as an array, so approvals would time out.

3. **Hook install scope plumbing is still inconsistent.**  
   `mcpInstall/index.ts` currently calls `applyAutomaticHookInstall` with `scope: requestedScope === "user" ? "global" : "local"`. The plan's opencode branch says `requestedScope === "user" ? "user" : "project"`, but `requestedScope` is not in scope inside `hooksInstall/index.ts`. Either pass `IntegrationScope` through directly or map `global -> user` and `local -> project` in the opencode branch.

4. **Phase 5 spawn snippet does not match the actual code shape.**  
   `managedAgents.ts` has `spawnArgsForRuntime(...)`, which returns only `{ args, nativeNameApplied, launchPromptDelivery }`; it cannot return `{ executable, env }`. Local `opencode --help` confirms `opencode [project]` is valid, but tmux already starts with `-c projectRoot`, so `opencode` alone may be enough. What still needs hot-testing is launch-prompt delivery: plain TUI + tmux injection vs `opencode --prompt <launchPrompt>` vs another argv.

5. **Plugin registration fallback is underspecified.**  
   The architecture says install writes the `plugin` config-array if needed, but Phase 2 explicitly defers JSONC config writes and no later step implements the fallback. Add the step or make A1/A2 hard blockers.

6. **JSONC parser should be hardened.**  
   The proposed scanner is okay for strings containing `//` and escaped quotes, but JSONC configs often contain trailing commas. Prefer `jsonc-parser`, or add trailing-comma support and tests. Also decide after A18 whether comments in `opencode.json` are stripped too.

7. **Phase 8 autoStream deletion is directionally safe, but keep it surgical.**  
   Delete only the Gemini `Notification/ToolPermission` branch and `invoke_agent` handling. Leave Claude/Codex `PostToolUse`, permission-response, and subagent paths intact, then run the existing Claude/Codex autoStream tests.

## Stop Conditions

The six Phase 0 stop conditions are good but not sufficient. Add blockers for:

- A0 partial pass: only deltas, no stable final marker/message id, or replayed full text with no dedupe key.
- A0/A4 missing opencode session ID on assistant/idle events.
- A4 `session.idle` absent, early, or not correlated after tool-free/error/permission turns.
- A1/A19 both fail: no working plugin load path.
- A6/A15 pass but `permission.ask` lacks enough request/session/call identity to match UI responses.
- Kernel API polling cannot observe access responses without adding a route or changing the template to `?kinds=...`/`{ events }`.

## Phase 0 Verdict

Thumbs-up to start **Phase 0 only**. Before Phase 1, patch the plan for the kernel route shapes, scope mapping, and plugin-registration fallback so the implementation does not inherit avoidable broken assumptions.

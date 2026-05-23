# Buddy Review: Phase 11 Hook Install Status

Date: 2026-05-23

Commits reviewed:
- `b4bf044` `feat(kernel/hooks-install): status + instructions routes (read-only, all 3 runtimes)`
- `1ff2cf5` `feat(kernel/hooks-install): codex adapter -- detect + render`
- `ffb7ff7` `feat(kernel/hooks-install): claude adapter -- detect + render`

## Executive Summary

Phase 11 is mostly implemented and the requested test suites pass. The routes are read-only, return the expected shape, cover Claude/Codex/Gemini, and are gated with the other process-API routes in `server.ts`.

I do not recommend accepting this phase as fully complete yet. There are three notable gaps:

1. `packages/kernel/src/hooksInstall/codex.ts:47` only reads `~/.codex/config.toml`; the spec/plan also require project-local `.codex/config.toml`.
2. `packages/kernel/src/hooksInstall/codex.ts:12` uses a fragile regex that misses valid multiline TOML arrays and falsely treats commented-out `command = ...` lines as installed hooks.
3. `packages/kernel/src/hooksInstall/claude.ts:57` renders a fenced JSON snippet that is not parseable as standalone JSON, despite the Phase 11 buddy brief asking for parseable JSON/TOML samples.

## Test Results

Targeted Phase 11 command:

```bash
pnpm --filter f-mark test tests/hooksInstall/ tests/routes/hookInstall.test.ts
```

Result: passed.

Observed counts:
- Claude: `tests/hooksInstall/claude.test.ts` passed 5 tests: installed, partial, snippet rendering, missing hooks key, null settings.
- Codex: `tests/hooksInstall/codex.test.ts` passed 4 tests: installed, partial, snippet rendering, empty TOML.
- Gemini: `tests/hooksInstall/gemini.test.ts` passed 2 tests: always-not-installed stub, snippet content.
- Routes: `tests/routes/hookInstall.test.ts` passed 5 tests: status happy path, missing params, unknown runtime, instructions happy path, instructions missing params.

Full v0.3.0 regression command:

```bash
pnpm --filter f-mark test
```

Result: passed, `66` test files and `367` tests.

Additional probes I ran against `detectCodexHooks`:
- Multiline TOML command arrays: reported `installed: false`, `detectedEntries: []`.
- Commented-out command lines: reported `installed: true`, with both commented commands in `detectedEntries`.
- Multiple same-event hooks with wrong ID before right ID: picked the right later hook and reported installed.
- Reverse partial install, `UserPromptSubmit` only: reported `installed: false`.

## Spec Compliance

- Read-only v0.4 behavior: pass. I found no `writeFile`, `appendFile`, `createWriteStream`, `rename`, or similar write calls in `packages/kernel/src/hooksInstall/` or `packages/kernel/src/routes/hookInstall.ts`; the adapters only call `readFile`.
- `DetectResult` shape: pass. `packages/kernel/src/hooksInstall/types.ts:6` defines `installed`, `configPath`, `detectedEntries`, and `expectedEntries`, and all runtime adapters return that shape.
- Gemini manual-stream mode: pass. `packages/kernel/src/hooksInstall/gemini.ts:3` always returns `installed: false`, empty entries, and a manual-stream note in `configPath`; `packages/kernel/src/hooksInstall/gemini.ts:12` renders manual-stream instructions.
- Process-API gate: pass. `packages/kernel/src/server.ts:170` computes `processApiEnabled`, and `packages/kernel/src/server.ts:183` registers hook-install routes inside that gate with the other managed-agent/process routes.

## Per-File Critique

### `packages/kernel/src/hooksInstall/claude.ts`

- `packages/kernel/src/hooksInstall/claude.ts:20` checks the expected `Stop` and `UserPromptSubmit` events.
- `packages/kernel/src/hooksInstall/claude.ts:24` detects commands by string match on `f-mark hook auto-stream`, then checks the agent id for `Stop` and user id for `UserPromptSubmit` at `packages/kernel/src/hooksInstall/claude.ts:26`.
- `packages/kernel/src/hooksInstall/claude.ts:49` treats missing files and malformed JSON as `null`; `packages/kernel/src/hooksInstall/index.ts:14` turns that into `{}`, so missing/malformed settings report not installed rather than crashing. That is acceptable for read-only status.
- Concern: `packages/kernel/src/hooksInstall/claude.ts:57` renders the JSON snippet as a property fragment beginning with `"hooks": { ... }`, not a complete JSON object. Extracting the fenced block and running `JSON.parse` fails. If the modal is meant to offer copyable parseable JSON, wrap the snippet in `{ ... }` or make the copy text explicitly a fragment.
- Minor test gap: only `Stop`-only partial install is tested in `packages/kernel/tests/hooksInstall/claude.test.ts:17`; the reverse `UserPromptSubmit`-only case is not covered.

### `packages/kernel/src/hooksInstall/codex.ts`

- `packages/kernel/src/hooksInstall/codex.ts:12` uses `HOOK_BLOCK_RE`, which is acceptable in spirit for v0.4, but it is too permissive and too line-oriented:
  - It misses valid multiline arrays like `command = [\n  "npx", ...\n]`.
  - It matches commented-out lines like `# command = ["npx", ...]`, causing false installed status.
- `packages/kernel/src/hooksInstall/codex.ts:17` correctly resets regex state before scanning.
- `packages/kernel/src/hooksInstall/codex.ts:23` correctly filters repeated same-event blocks by participant id; a wrong-id `Stop` before a right-id `Stop` still results in the right entry being detected.
- `packages/kernel/src/hooksInstall/codex.ts:30` correctly requires both `Stop` and `UserPromptSubmit` before `installed: true`; the untested reverse partial case reports false.
- Spec gap: `packages/kernel/src/hooksInstall/codex.ts:47` only reads `codexConfigPath()`, which is `~/.codex/config.toml` from `packages/kernel/src/hooksInstall/codex.ts:6`. The design spec says Codex parsing should consider both `~/.codex/config.toml` and project-local `.codex/config.toml`.

### `packages/kernel/src/hooksInstall/gemini.ts`

- `packages/kernel/src/hooksInstall/gemini.ts:3` is the expected v0.4 stub.
- `packages/kernel/src/hooksInstall/gemini.ts:6` includes the requested manual-stream note.
- No blocking concerns.

### `packages/kernel/src/hooksInstall/index.ts`

- `packages/kernel/src/hooksInstall/index.ts:6` dispatches status checks for the three runtimes and throws on unknown runtime.
- `packages/kernel/src/hooksInstall/index.ts:11` defaults missing `userParticipantId` to `us-unknown`. That matches the permissive GET route, but it means Claude/Codex status can report partial/not installed unless callers pass the user participant id. This is probably okay for current routes, but the caller contract should stay explicit.
- `packages/kernel/src/hooksInstall/index.ts:24` renders instructions without writes, as required.

### `packages/kernel/src/routes/hookInstall.ts`

- `packages/kernel/src/routes/hookInstall.ts:5` registers `GET /managed-agents/hook-install-status`.
- `packages/kernel/src/routes/hookInstall.ts:25` registers `POST /managed-agents/hook-install-instructions`.
- `packages/kernel/src/routes/hookInstall.ts:9` and `packages/kernel/src/routes/hookInstall.ts:29` enforce required parameters.
- `packages/kernel/src/routes/hookInstall.ts:19` and `packages/kernel/src/routes/hookInstall.ts:39` turn unknown runtime errors into HTTP 400s.
- No write behavior found.

### `packages/kernel/src/server.ts`

- `packages/kernel/src/server.ts:170` gates process-API availability.
- `packages/kernel/src/server.ts:183` registers hook-install routes under that gate. This satisfies the "co-exist with other process-API routes" requirement.

### Tests

- `packages/kernel/tests/hooksInstall/claude.test.ts:4` has the requested 5 Claude tests.
- `packages/kernel/tests/hooksInstall/codex.test.ts:4` has the requested 4 Codex tests.
- `packages/kernel/tests/hooksInstall/gemini.test.ts:4` has the requested 2 Gemini tests.
- `packages/kernel/tests/routes/hookInstall.test.ts:11` has the requested 5 route tests.
- Missing coverage I would add before calling the phase done: Codex multiline array, Codex commented command line, Codex project-local config loading, Claude/Codex reverse partial install, and parseability/clarity of the rendered snippets.

## Recommendation

Request changes before marking Phase 11 complete.

The implementation is green against the requested suites and safe from automated config writes, but Codex status can be wrong in realistic config files and does not meet the project-local config requirement. I would fix `loadCodexConfig` to include project-local TOML, replace or tighten `HOOK_BLOCK_RE`, and make the Claude snippet either parseable JSON or clearly a fragment before approving.

## Phase 11 Fix Re-verification

Status: PASS-WITH-FOLLOW-UP for commit `5470d9c`. The Codex parser and Claude snippet findings are addressed. The project-local Codex TOML finding is addressed inside the adapter helper, but not fully wired through the active status call paths.

Finding 1, Codex project-local `.codex/config.toml`: partially addressed. `packages/kernel/src/hooksInstall/codex.ts:144` now accepts an optional `projectRoot`, reads `~/.codex/config.toml`, then reads `<projectRoot>/.codex/config.toml` at `packages/kernel/src/hooksInstall/codex.ts:151`. `packages/kernel/src/hooksInstall/index.ts:6` also accepts `projectRoot` and passes it to `loadCodexConfig` at `packages/kernel/src/hooksInstall/index.ts:18`. However, the live route path still calls `checkHookInstallStatus` without `projectRoot` in `packages/kernel/src/routes/hookInstall.ts:14`, and reconcile does the same in `packages/kernel/src/reconcile.ts:77`. Existing new coverage simulates combined user/project TOML in `packages/kernel/tests/hooksInstall/codex.test.ts:95`, but does not directly test `loadCodexConfig(projectRoot)` reading an actual project-local file.

Finding 2, Codex multiline arrays and commented-out lines: addressed. The old regex was replaced by a scanner: comments are stripped before parsing at `packages/kernel/src/hooksInstall/codex.ts:16`, multiline command arrays are captured by bracket-depth tracking in `findHookCommands` at `packages/kernel/src/hooksInstall/codex.ts:51`, and `detectCodexHooks` consumes those parsed commands at `packages/kernel/src/hooksInstall/codex.ts:114`. Tests cover multiline arrays at `packages/kernel/tests/hooksInstall/codex.test.ts:41`, commented-out command lines at `packages/kernel/tests/hooksInstall/codex.test.ts:65`, and mixed single-line/multiline hooks at `packages/kernel/tests/hooksInstall/codex.test.ts:78`.

Finding 3, Claude parseable JSON snippet: addressed. `renderClaudeInstallSnippet` now builds a full object and renders it with `JSON.stringify(snippet, null, 2)` at `packages/kernel/src/hooksInstall/claude.ts:57`, producing a standalone parseable fenced JSON block. The test at `packages/kernel/tests/hooksInstall/claude.test.ts:43` extracts the fenced block, runs `JSON.parse`, and asserts both expected hook commands and `--kind user`.

Test result: passed. Command run:

```bash
pnpm --filter f-mark test tests/hooksInstall/
```

Observed result: `3` test files passed and `16` tests passed: `tests/hooksInstall/gemini.test.ts`, `tests/hooksInstall/claude.test.ts`, and `tests/hooksInstall/codex.test.ts`.

Recommendation: request one small follow-up before calling Phase 11 fully complete: pass the kernel project root into hook-install status checks from the route/reconcile call paths, and add a direct `loadCodexConfig(projectRoot)` test with a temporary project `.codex/config.toml`. After that, the three original findings should be fully closed.

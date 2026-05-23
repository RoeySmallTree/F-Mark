# Buddy Review: tmux Orchestration Phase 3

## Executive Summary

**PASS-WITH-FIXES.**

Phase 3's core implementation is present and functional: targeted tests and the full kernel suite pass, the runtime model uses separate `executable` + `args[]` fields with no `command` field, defaults match the spec, `initProject()` seeds `.f-mark/runtimes.json`, and `initRuntimesFile()` is idempotent instead of clobbering user edits.

The main fix to carry forward is defensive file validation: `loadRuntimes()` validates runtime entries, but it does not validate that the parsed file itself is an object with a `runtimes` object. A hand-edited `{ "version": "1.0" }` file is accepted as a `RuntimesFile` with `runtimes === undefined`, and a later `upsertRuntime()` will crash on `cfg.runtimes[id] = entry`. Malformed JSON also bubbles a raw `SyntaxError` without naming `runtimes.json`. Direct writes are non-atomic; not a v0.4 blocker, but worth tracking.

## Test Invocations

### Targeted Phase 3 Tests

Command:

```bash
pnpm --filter f-mark test tests/runtimes/ tests/project.test.ts
```

Result:

- **PASS**
- 3 test files passed.
- 15 tests passed.
- `tests/runtimes/validation.test.ts`: 7 tests passed.
- `tests/runtimes/registry.test.ts`: 5 tests passed.
- `tests/project.test.ts`: 3 tests passed.

Coverage confirmed:

- Validation tests cover safe executables, shell-metacharacter rejection, args array validation, non-string arg rejection, slash command syntax including the 33-character rejection, message text control-character rejection for newline/NUL, and runtime entry shape.
- Registry tests cover `initRuntimesFile()` defaults creation, idempotency preserving user edits, `upsertRuntime()`, `removeRuntime()`, and bad-executable rejection.
- Project tests confirm `initProject()` creates `runtimes.json` with `claude`, `codex`, and `gemini` entries.

### Full Kernel Suite

Command:

```bash
pnpm --filter f-mark test
```

Result:

- **PASS**
- 49 test files passed.
- 256 tests passed.
- No regressions found in the existing baseline plus Phase 3 additions.

## Per-File Critique

### `packages/kernel/src/runtimes/validation.ts`

Passes the core security shape.

- `EXECUTABLE_RE` is `^[a-zA-Z0-9_./-]+$`, matching the spec and rejecting spaces plus shell metacharacters such as `;`, `&&`, pipes, backticks, `$()`, and newlines.
- `SLASH_RE` is `^[a-zA-Z][a-zA-Z0-9_-]{0,31}$`, which correctly allows at most 32 total characters. This intentionally differs from the draft `{0,32}` pattern and matches the test intent.
- `validateArgs()` accepts only arrays of strings. It does not reject shell-looking strings inside args, which is correct because args are passed as argv entries rather than through a shell.
- `RuntimeEntryShape` is `{ displayName, executable, args, env?, icon?, readyDelayMs? }`; no `command` field.
- `validateRuntimeEntry()` checks required fields, `env` values, `icon`, and `readyDelayMs` type.

Minor gap:

- `validateMessageText()` rejects characters `< 0x20` except tab, so newline and NUL are blocked. It does not reject `0x7f` (DEL). If "control characters" is intended in the full ASCII sense, add `c === 0x7f`.

### `packages/kernel/src/runtimes/defaults.ts`

Matches the spec exactly:

- `claude`: `{ displayName: "Claude Code", executable: "claude", args: [], icon: "claude", readyDelayMs: 2000 }`
- `codex`: `{ displayName: "Codex", executable: "codex", args: [], icon: "codex", readyDelayMs: 1500 }`
- `gemini`: `{ displayName: "Gemini", executable: "gemini", args: [], icon: "gemini", readyDelayMs: 1500 }`

No issues found.

### `packages/kernel/src/runtimes/registry.ts`

Core CRUD behavior is present and tested.

- `initRuntimesFile()` creates `.f-mark/runtimes.json` when absent.
- `initRuntimesFile()` is truly idempotent for existing files: it returns when the file exists and therefore preserves user edits.
- `loadRuntimes()` validates each runtime entry, which protects against hand-edited entries containing unsafe executables.
- `saveRuntimes()` validates entries before writing.
- `upsertRuntime()` validates the new entry before loading/saving.
- `removeRuntime()` deletes the entry and re-saves the file.

Issues / follow-ups:

- **Top-level shape validation is missing.** `loadRuntimes()` does `Object.entries(parsed.runtimes ?? {})`, so a file with missing `runtimes` is accepted rather than rejected. A non-object root can also produce a generic runtime error. Add a `validateRuntimesFile()` check for object root, string `version`, and object `runtimes`.
- **Malformed JSON error is raw.** `JSON.parse()` errors are not wrapped with the file path or a helpful message such as `invalid .f-mark/runtimes.json`. This is survivable but rough for a user-edited file.
- **Writes are direct.** `saveRuntimes()` uses `writeFile()` directly instead of temp-file + rename. This can corrupt the registry if the process crashes mid-write. Not a blocker for v0.4, but should be fixed when registry edits become UI-facing.

### `packages/kernel/src/project.ts`

Passes the integration requirement.

- `initProject()` imports `initRuntimesFile()`.
- It calls `await initRuntimesFile(p.fmarkDir())` after the AGENT.md write path.
- This creates `.f-mark/runtimes.json` for new projects while preserving any existing registry through `initRuntimesFile()` idempotency.

No blocking issues found.

## Spec Compliance

- **Runtime model:** Compliant. The model uses `executable`, `args[]`, `env?`, `icon?`, and `readyDelayMs?`; there is no runtime `command` field.
- **No shell injection surface:** Compliant for executable validation. The executable regex rejects spaces and shell metacharacters. Args are separate strings, which is the intended safe representation.
- **Defaults:** Compliant. Built-in `claude`, `codex`, and `gemini` defaults match the spec values.
- **Project initialization:** Compliant. `initProject()` writes defaults through `initRuntimesFile()`.
- **User-edit preservation:** Compliant. Existing `runtimes.json` is not overwritten.
- **Defensive parsing:** Partial. Runtime entries are validated, but the file container shape and parse-error UX need tightening.

## Recommendation

Approve Phase 3 as **PASS-WITH-FIXES**.

Before calling this phase fully closed, I recommend adding a small hardening patch:

1. Add `validateRuntimesFile()` and use it from both `loadRuntimes()` and `saveRuntimes()`.
2. Wrap `JSON.parse()` failures with a contextual `invalid .f-mark/runtimes.json` error.
3. Optionally update `validateMessageText()` to reject `0x7f` if the intended rule is all ASCII controls except tab.
4. Track atomic temp-file + rename writes as a v0.4 hardening follow-up, especially before the Settings UI starts editing runtimes.

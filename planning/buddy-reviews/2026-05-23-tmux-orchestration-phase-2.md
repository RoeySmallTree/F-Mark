# Phase 2 Buddy Verification: Tmux Manager

## Executive Summary

FAIL

The test suites are green locally, including the expected 23 new tmux tests and 211 total kernel tests.

Do not proceed to Phase 3 yet: the manager tests do not verify the critical exact `tmux new-session` argv shape, and the implementation has spec/safety gaps around long session names, shell-quoted tmux commands, and command failure handling.

## Test Invocations

Command:

```bash
pnpm --filter f-mark test tests/tmux/
```

Result:

```text
Test Files  4 passed (4)
Tests       23 passed (23)
```

Full observed file/test breakdown:

```text
tests/tmux/naming.test.ts (6 tests)
tests/tmux/manager.test.ts (9 tests)
tests/tmux/commandRunner.test.ts (5 tests)
tests/tmux/inputQueue.test.ts (3 tests)
```

Command:

```bash
pnpm --filter f-mark test
```

Result:

```text
Test Files  43 passed (43)
Tests       211 passed (211)
```

This preserves the v0.3.0 baseline expectation: 188 previous tests + 23 new tmux tests = 211 total. I did not observe a regression in the original suite.

## Commit Scope

Checked with:

```bash
git show --stat a006c03 7e974d1 93ed610 55fd26f
```

The four Phase 2 commits only touched:

```text
packages/kernel/src/tmux/naming.ts
packages/kernel/tests/tmux/naming.test.ts
packages/kernel/src/tmux/commandRunner.ts
packages/kernel/tests/tmux/commandRunner.test.ts
packages/kernel/src/tmux/manager.ts
packages/kernel/tests/tmux/manager.test.ts
packages/kernel/src/tmux/inputQueue.ts
packages/kernel/tests/tmux/inputQueue.test.ts
```

No Phase 2 commit wandered outside `packages/kernel/src/tmux/*.ts` or `packages/kernel/tests/tmux/*.test.ts`.

Note: the current worktree has unrelated dirty renderer/planning files, but they are not part of the four reviewed commits.

## TDD Discipline

Each Phase 2 commit lands its corresponding implementation and test file together:

- `a006c03`: `naming.ts` + `naming.test.ts`
- `7e974d1`: `commandRunner.ts` + `commandRunner.test.ts`
- `93ed610`: `manager.ts` + `manager.test.ts`
- `55fd26f`: `inputQueue.ts` + `inputQueue.test.ts`

I cannot prove from commit metadata alone that the tests were run red before implementation, but the commit grouping satisfies the same-commit test discipline requested by the plan.

The tests contain real assertions, not just function calls. However, several assertions are too loose for the tmux boundary.

## Per-File Critique

### `packages/kernel/tests/tmux/manager.test.ts`

- **Blocker, lines 9-29:** `spawnAgent` does not verify the exact argv shape. It only checks `toContain("-d")`, `toContain("-s")`, and the final executable/args. It does not assert the full array, the position of `-d`, `-s`, `-c`, the `-e` environment flag, the `@fmark-project`/`@fmark-participant` `set-option` calls, or a `--` separator before the spawned command. This misses the critical spec-review concern.

- **Major, lines 31-38:** `spawnTerminal` only asserts the session suffix. It does not verify `tmux new-session -d -s <session> -c <projectRoot> ...`, nor the `@fmark-project` `set-option` call.

- **Major, lines 40-52:** `listFmarkSessions` verifies filtering behavior, but not the exact `show-options -t <session> -v @fmark-project` argv per candidate.

- **Major:** `startPipePane`, `stopPipePane`, `resize`, and direct `getUserOption` are not tested at all, even though they are manager primitives added in Phase 2. This leaves the pipe-pane semantics unexercised.

### `packages/kernel/src/tmux/manager.ts`

- **Blocker, line 59:** `spawnAgent` builds `tmux new-session` without a `--` separator before the runtime command. This is exactly the kind of argv-boundary issue the review prompt called out. It is also untested.

- **Major, line 59:** `executable` and `args` are passed to `tmux new-session` as separate client argv entries, but tmux ultimately runs a shell command string. Without explicit shell quoting/command construction, args containing spaces or shell metacharacters can be reinterpreted. This conflicts with the architecture requirement that runtimes keep `executable` and `args[]` separate rather than relying on whitespace splitting.

- **Major, line 104:** `startPipePane` uses `cat >> ${fifo}` without shell quoting. FIFO paths with spaces will break, and paths containing shell metacharacters can alter the command. The `-o` flag does satisfy single-pipe-open semantics, but the shell command itself is unsafe.

- **Major, lines 93-120:** most manager methods ignore non-zero `tmux` exit codes (`killSession`, `captureSnapshot`, `startPipePane`, `stopPipePane`, `sendLiteralText`, `sendKey`, `resize`). Callers will treat failed tmux operations as success.

- **Minor, line 98:** `captureSnapshot` does make the required single `capture-pane` call with `-p -e -J -S -2000`. This part is compliant and tested exactly.

- **Minor, lines 111-117:** literal/key send modes are correctly separated: literal text uses `send-keys -l --`, while named keys use `send-keys --`. This part is compliant and tested exactly.

### `packages/kernel/src/tmux/naming.ts`

- **Major, lines 25-28:** long project basenames are handled by slicing the entire session name to 90 chars. That can remove the hash, `-ag-` marker, and participant id, producing a name that no longer matches the F-Mark convention or preserves collision resistance. The basename should be truncated before composing the suffix, preserving `<hash8>-(ag|term)-...`.

- **Minor, lines 8-10:** `projectRootHash` hashes the provided string as-is. The spec says the hash is over the absolute project root. This is compliant only if every caller has already canonicalized `projectRoot`; the helper/test does not enforce that invariant.

- **Minor, lines 44-51:** terminal parsing uses `Number.parseInt`, so `fmark-x-12345678-term-2abc` parses as index `2`. The terminal suffix should be fully numeric if it is going to be accepted.

### `packages/kernel/tests/tmux/naming.test.ts`

- **Major, lines 33-38:** the long-participant test only checks `contains("-ag-ag-")` and total length. It does not assert the actual id portion is capped at 32 chars, and it does not cover a long basename where the current implementation can truncate away the hash/kind suffix.

### `packages/kernel/src/tmux/commandRunner.ts`

- **Major, lines 17-25:** `realCommandRunner` does not handle the child process `error` event. If `tmux` or another executable is missing, Node emits an unhandled error and the process crashes instead of returning a structured non-zero result/null version path.

- **Major, lines 42-58:** `fakeCommandRunner` never verifies that all expected commands were consumed. A test can enqueue an expected `set-option` call and still pass if the implementation never runs it. This weakens the manager tests specifically.

- **Minor, lines 50-56:** fake expectations are prefix matches. That can be useful, but the manager tests need exact `calls` assertions wherever argv shape matters.

### `packages/kernel/tests/tmux/commandRunner.test.ts`

- **Major:** the fake runner tests verify unexpected commands, but do not verify that missing expected commands fail the test. This is why omitted `set-option` calls could slip through.

### `packages/kernel/src/tmux/inputQueue.ts`

- **Minor, lines 6-15:** FIFO ordering and rejection propagation look correct. The map never deletes completed pane tails, so a long-running process that sees many pane keys can retain entries indefinitely.

### `packages/kernel/tests/tmux/inputQueue.test.ts`

- **Pass:** the tests have meaningful assertions for same-pane serialization, cross-pane non-serialization, and rejection propagation.

## Spec Compliance

Confirmed compliant:

- Session names include `fmark-<basename>-<hash8>-ag-...` and `fmark-<basename>-<hash8>-term-...` for normal-length basenames.
- `spawnAgent` sets `@fmark-project` and `@fmark-participant`.
- `spawnTerminal` sets `@fmark-project`.
- `listFmarkSessions` verifies `@fmark-project` before returning sessions.
- `sendLiteralText` uses `tmux send-keys -l --`.
- `captureSnapshot` uses one `tmux capture-pane -t <session> -p -e -J -S -2000` invocation.
- `startPipePane` uses `pipe-pane -o`, which is the right shape for single open-if-not-already-piped semantics.

Gaps:

- Exact manager spawn argv is not tested and currently lacks a `--` separator before the runtime command.
- Long session names can lose the hash/kind suffix, violating the collision-resistance and recognizable-prefix convention.
- Pipe shell command construction is unsafe for FIFO paths with spaces/metacharacters.
- Several tmux manager operations ignore command failure.
- Missing executable handling in the real command runner can crash the process instead of surfacing a clean tmux-unavailable state.

## Recommendation

Address findings before Phase 3.

Minimum fix set:

1. Strengthen manager tests to assert exact argv arrays for `spawnAgent`, `spawnTerminal`, `set-option`, `show-options`, `pipe-pane`, and `resize`.
2. Add a fake runner verification method or after-test assertion so missing expected commands fail.
3. Preserve the hash/kind/id suffix when truncating session names.
4. Add safe shell quoting/command construction for `new-session` runtime commands and `pipe-pane` FIFO paths.
5. Return or throw consistently on non-zero tmux command results, and handle `spawn` `error` events.

## Re-verification (2026-05-23)

Status: PASS

Fix commit reviewed: `599e5ce fix(kernel/tmux phase 2): address buddy findings`.

Original findings:

1. **Addressed - `--` separator before runtime command in `spawnAgent` argv.** `spawnAgent` now inserts `--` between tmux flags/project cwd and the runtime executable at `packages/kernel/src/tmux/manager.ts:68-80`; the manager test asserts the complete argv, including the separator, at `packages/kernel/tests/tmux/manager.test.ts:25-39`.

2. **Addressed - exact-argv assertions in manager tests.** The loose `toContain` checks have been replaced with full-array `toEqual` assertions for `spawnAgent`, `spawnTerminal`, `listFmarkSessions`, pipe, send, resize, and option calls. Representative coverage is at `packages/kernel/tests/tmux/manager.test.ts:24-56`, `packages/kernel/tests/tmux/manager.test.ts:82-102`, `packages/kernel/tests/tmux/manager.test.ts:119-137`, `packages/kernel/tests/tmux/manager.test.ts:180-188`, and `packages/kernel/tests/tmux/manager.test.ts:262-268`.

3. **Addressed - basename truncation preserves hash/kind/id suffix.** Session name construction now truncates only the basename before composing the preserved suffix via `truncBasename` and the final agent/terminal builders at `packages/kernel/src/tmux/naming.ts:33-64`. Regression tests assert long-basename agent and terminal names retain the hash/kind/id suffix at `packages/kernel/tests/tmux/naming.test.ts:40-60`.

4. **Addressed - FIFO path validation in `startPipePane`.** `SAFE_FIFO_PATH` restricts shell-embedded FIFO paths to characters with no shell-special meaning at `packages/kernel/src/tmux/manager.ts:38-41`, and `startPipePane` rejects invalid paths before issuing `pipe-pane` at `packages/kernel/src/tmux/manager.ts:133-140`. Tests cover exact valid argv and rejection of spaces/metacharacters at `packages/kernel/tests/tmux/manager.test.ts:175-208`.

5. **Addressed - non-zero tmux exit throws in manager primitives.** `spawnAgent`/`spawnTerminal`, `setUserOption`, `killSession`, `captureSnapshot`, `startPipePane`, `stopPipePane`, `sendLiteralText`, `sendKey`, and `resize` now throw on non-zero exits at `packages/kernel/src/tmux/manager.ts:49-52`, `packages/kernel/src/tmux/manager.ts:81-84`, `packages/kernel/src/tmux/manager.ts:101-103`, and `packages/kernel/src/tmux/manager.ts:122-160`. Tests exercise the non-zero paths at `packages/kernel/tests/tmux/manager.test.ts:59-70`, `packages/kernel/tests/tmux/manager.test.ts:149-154`, `packages/kernel/tests/tmux/manager.test.ts:167-172`, `packages/kernel/tests/tmux/manager.test.ts:203-225`, `packages/kernel/tests/tmux/manager.test.ts:237-259`, and `packages/kernel/tests/tmux/manager.test.ts:271-276`.

6. **Addressed - `realCommandRunner` handles child `error` event.** The runner now settles once and converts child process `error` events into `{ stdout: "", stderr, exitCode: 127 }` at `packages/kernel/src/tmux/commandRunner.ts:23-37`. The missing-executable test covers the behavior at `packages/kernel/tests/tmux/commandRunner.test.ts:19-25`.

7. **Addressed - `fakeCommandRunner` verifies all expected commands consumed.** `verifyExpectationsConsumed()` was added at `packages/kernel/src/tmux/commandRunner.ts:49-70`; tests cover both unconsumed and fully consumed cases at `packages/kernel/tests/tmux/commandRunner.test.ts:48-60`. Manager tests also call it after each scenario, e.g. `packages/kernel/tests/tmux/manager.test.ts:56`, `packages/kernel/tests/tmux/manager.test.ts:102`, and `packages/kernel/tests/tmux/manager.test.ts:137`.

8. **Addressed - `parseFmarkSessionName` strict numeric terminal index.** Terminal parsing now rejects non-`/^\d+$/` suffixes before `Number.parseInt` at `packages/kernel/src/tmux/naming.ts:77-86`; tests cover `2abc`, empty, alpha, and valid numeric cases at `packages/kernel/tests/tmux/naming.test.ts:75-84`.

9. **Addressed - minor `projectRootHash` canonicalization note.** The helper now documents that callers must pass an absolute, canonicalized path and that the helper intentionally hashes its input as-is at `packages/kernel/src/tmux/naming.ts:8-17`.

10. **Accepted as intentionally skipped - minor `inputQueue` tail cleanup.** Per instruction, no cleanup change was required. The tail map behavior remains unchanged at `packages/kernel/src/tmux/inputQueue.ts:6-14`; this is acceptable for Phase 2.

Test invocation:

```bash
pnpm --filter f-mark test
```

Result:

```text
Test Files  49 passed (49)
Tests       256 passed (256)
```

This is above the implementer's reported 252-pass count, so I observed no regression in the current workspace.

No new issue was introduced by the fix commit in the reviewed tmux surface.

Recommendation: proceed to Phase 3.

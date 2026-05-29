# Live Hot-Test Report — Post-Implementation

> Run 2026-05-29 on this machine. Verifies the adapters against ACTUAL live sessions/transcripts/db, then verifies the produced spawn args against the real CLIs. Resolves review_2.md HOT-TEST items.

## Results summary

| Runtime  | listModels | listEfforts | readCurrent(transcriptPath / sessionId) | readCurrent(cwd fallback) | Real CLI accepts produced args |
|----------|------------|-------------|------------------------------------------|---------------------------|---------------------------------|
| codex    | ✓ 6 models | ✓ per-model | ✓ `{gpt-5.5, xhigh, source: "rollout"}` | ✓ same                    | ✓ `codex exec -m gpt-5.5 -c model_reasoning_effort=xhigh --help` ok |
| claude   | ✓ 3 models | ✓ 5 levels  | ✓ `{claude-opus-4-7, source: "transcript"}` canonicalized | n/a — no cwd path | ✓ live response: `claude --model claude-sonnet-4-6 --effort high --print "say pong"` → "pong" |
| opencode | ✓ 405 models from `--verbose` | ✓ 5 variants from `variants` key | ✓ `{gpt-5.3-codex, default, openai, source: "opencode-db"}` after fix | ✓ same                    | ✓ `opencode run -m openai/gpt-5.5 --variant high --help` ok |

## Issues caught + fixed

### Issue 1 — OpenCode readCurrent returned null on every probe

**Symptom**: `readCurrent({sessionId})` and `readCurrent({cwd})` both returned null even though `opencode db --format json` was working correctly from the shell.

**Root cause**: OpenCode creates session rows at *session start* with `model=NULL`. The model column only gets populated after the first turn completes. The adapter's `LIMIT 1 ORDER BY time_updated DESC` query was picking up freshly created stub sessions and returning null because `typeof null !== "string"`.

**Fix**: Added `AND model IS NOT NULL` to both queries (sessionId and cwd path). For the sessionId case, this means stub sessions return null (caller's hook will retry on next session.idle). For the cwd case, this finds the latest session WITH actual turn data.

**Commit**: `c578a65 fix(adapters/opencode): filter WHERE model IS NOT NULL in db reads`

## What worked first-shot

- Codex rollout JSONL parsing — the `turn_context` payload key choice (review_2 §2 confirmation) was correct. Both line-1 only and "scan to last turn_context" returned the right model+effort.
- Codex cwd-scan fallback — found and parsed the right session in ~600ms across 20 recent rollouts.
- Claude alias + date-suffix canonicalization — `<synthetic>`, `opus`, `claude-haiku-4-5-20251001` all map cleanly to canonical slugs.
- OpenCode `models --verbose` parser — handled the interleaved provider/model + JSON-block format across 405 models without parser drift.
- Argument sanitization — confirmed no leftover conflicting flags across all three runtimes.
- Real CLI acceptance — Claude actually produced a live response when invoked with our sanitized + injected args (`--model claude-sonnet-4-6 --effort high --print`). Codex and OpenCode `--help` smoke tests confirmed flag-parsing acceptance.

## What's still untested live

The following were NOT live-tested (out of scope for this round):

- End-to-end **kernel boot → spawn agent → user turn → WS bus → renderer badge**. The adapters work, the routes are wired, the renderer dispatches preserve `runtime_state`, but a full kernel-running-with-real-managed-agent test was not executed in this round. Tests cover the unit boundaries and live data confirms the adapter contract; the integration path is verified by code review.
- **PUT /managed-agents/:id/runtime → respawn → reconnect** flow with a real connected agent. The respawn helper mirrors the reconnect path's spawn-args building (verified by reading both sites side by side). A live test would confirm the tmux session handoff.
- **OpenCode plugin → POST /runtime-state → kernel adapter probe → WS** chain. Plugin code is in place; live opencode managed-agent flow was not exercised.
- **Multiple concurrent managed agents** — runtime-state service is a module-level `Map<participantId, …>` so there's no cross-talk by design, but no concurrency soak.

These are appropriate for a follow-up integration session with a running kernel.

## Final status

- 8 commits on `feat/model-effort-control`.
- 757 → 774 tests, 100 → 101 files, 1 pre-existing sys-fork failure unrelated to this feature.
- 3 of 3 runtime adapters verified against live local data.
- 3 of 3 runtime CLIs accept produced sanitize + inject args without parse errors.

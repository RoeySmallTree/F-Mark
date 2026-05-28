# Phase 1.3 — Plugin template hot-load smoke test

**Verdict: PASS** — Template loads in real opencode runtime without crashing; non-blocking on kernel errors.

## Setup
- Template at `packages/kernel/assets/opencode-plugin/fmark.ts` copied to `~/.config/opencode/plugin/fmark.ts`
- opencode v1.15.11 + bundled plugin SDK 1.14.33
- `pnpm -F kernel typecheck` would not yet cover this file (not in kernel src/); standalone `tsc --strict --moduleResolution nodenext` against the bundled SDK exit code 0

## Test 1 — Plugin idle when env not set

```bash
opencode run "say HI" --print-logs
```

Expected: plugin logs idle, opencode runs normally.
Result: `f-mark plugin vphase-opencode-v1: F_MARK_AGENT_ID not set or .f-mark/ missing; idle` + `HI` output. PASS.

## Test 2 — Plugin loads when env set; non-blocking on kernel errors

```bash
F_MARK_AGENT_ID=ag-hottest F_MARK_PATH=/tmp/fake-fmark-path opencode run "say HI" --print-logs
```

Expected: plugin binds, attempts HTTP POST, kernel returns error (409 STALE_PATH because the path doesn't match), opencode session completes anyway.

Result:
```
f-mark plugin vphase-opencode-v1: agent=ag-hottest kernel=http://localhost:7779
HI
f-mark plugin: POST /sessions/2026-05-28-test6/events/prose -> 409
```

PASS:
- Plugin walked up from opencode's cwd (the F-Mark repo) to find a `.f-mark/` directory and loaded the kernel URL + token from it.
- Posted ONE prose event (the assistant "HI" response) — confirming the role-map architecture (A0) correctly suppressed the user prompt.
- Kernel returned 409 (stale path) — plugin logged the error to stderr and did NOT crash the agent.
- opencode session completed normally — "HI" delivered to the user.

## Architectural confirmations

- ✓ A0 (assistant text filter via role map) works in vivo
- ✓ Plugin is non-blocking on HTTP errors (try/catch in `httpJson`)
- ✓ Plugin gracefully handles missing F-Mark context (idle log)
- ✓ Plugin discovers `.f-mark/` via upward walk when `F_MARK_PATH` is invalid

## Next

Phase 2: hooksInstall/opencode.ts adapter (sidecar metadata, scope param, dispatcher wiring).

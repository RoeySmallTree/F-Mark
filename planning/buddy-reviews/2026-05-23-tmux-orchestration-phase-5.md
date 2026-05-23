# Phase 5 Buddy Verification: autoStream Presence Ping

## Executive Summary

PASS

Commit `abb1357` implements the Phase 5 scope: `runAutoStream` now calls a new best-effort `postPing()` after hook context and active-session lookup, before either assistant or user event projection. The v0.3.0 event-posting behavior is preserved in the tested paths: prose/tool-use/turn-end payloads and early-return semantics still match the existing contract, with only the intentional added presence ping.

The main caveat is latency: `postPing()` is awaited and uses Node `fetch` without a timeout. A hung ping request can block the hook before event POSTs, and it also affects paths that previously did no network work, such as `stop_hook_active=true` and no-event transcript fires. This is probably acceptable for v0.4 as designed, but it is the one production-contract risk I would keep visible.

## Test Results

Targeted hooks suite:

```text
$ pnpm --filter f-mark test tests/hooks/

Test Files  7 passed (7)
Tests       28 passed (28)
```

Full kernel suite:

```text
$ pnpm --filter f-mark test

Test Files  49 passed (49)
Tests       256 passed (256)
```

This matches the implementer-reported 256-test full-suite total. The existing `autoStream` tests were updated for the extra ping call count and pass:

- Assistant concluding turn: ping + prose + turn-end.
- Assistant `stop_hook_active=true`: ping only, no event posts.
- Missing active-session pointer: no ping, same stderr/exit behavior.
- User prompt: ping + prose, no turn-end.

## Spec Compliance

- `packages/kernel/src/hooks/post.ts:54` exports `postPing(ctx, participantId)`.
- `packages/kernel/src/hooks/post.ts:56-60` POSTs to `/agents/:id/ping` with `Authorization: Bearer <token>`, `Content-Type: application/json`, and body `{}`.
- `packages/kernel/src/hooks/post.ts:55-63` swallows thrown fetch/network failures. Non-2xx responses are also best-effort because the response is never status-checked.
- `packages/kernel/src/hooks/autoStream.ts:31-55` keeps malformed JSON, bad hook context, and missing active session on the old no-network early-return path.
- `packages/kernel/src/hooks/autoStream.ts:55` awaits ping after context + active-session load and before both assistant/user branches.
- `packages/kernel/src/hooks/autoStream.ts:57-72` keeps assistant event projection and turn-end posting after the ping.
- `packages/kernel/src/hooks/autoStream.ts:59` confirms `stop_hook_active=true` returns after the ping, so this fire now bumps presence while still writing no events.
- `packages/kernel/src/routes/presence.ts:9-17` confirms the endpoint pings the tracker and returns `204`; Phase 4 route tests cover tracker mutation.
- `packages/kernel/src/presence/tracker.ts:53-61` confirms a ping records `lastHookAt`, derives state, and broadcasts state changes.

Against the spec:

- Migration from v0.3.0: event-log behavior remains additive. The only observable difference is the intentional extra presence POST plus its latency profile.
- Presence: hook fire -> `/agents/:id/ping` -> tracker bump -> WS broadcast path is present.
- Sequencing: ping is awaited before event POSTs, and the helper is best-effort on failure.

## Per-File Critique

### `packages/kernel/src/hooks/post.ts`

- [OK] `postPing` is narrowly scoped and does not disturb `postProjectedEvents`.
- [OK] Network errors are swallowed, and non-2xx responses cannot throw because the response is ignored.
- [LOW] The helper has no timeout or abort signal. If the kernel accepts the connection and stalls, the hook can wait indefinitely before posting events. A short timeout would reduce the v0.3.0 regression surface without changing the presence contract.
- [LOW] `ping.test.ts` verifies URL/auth and failure swallowing, including non-2xx, but does not assert the `{}` body or `Content-Type`. The source is correct; adding assertions would lock the endpoint contract down.

### `packages/kernel/src/hooks/autoStream.ts`

- [OK] Ping placement is correct for Phase 5: after `loadHookContext()` and active-session lookup, before assistant/user branches.
- [OK] Malformed JSON and no-session cases do not ping, matching the requested "successful hook fire" interpretation.
- [OK] Assistant/user event semantics are unchanged after the ping. The tests still assert event call order and payloads.
- [OK] `stop_hook_active=true` now pings before returning and writes no events, which matches the Phase 5 "every fire pings" intent.
- [LOW] The added await changes timing for paths that formerly returned without any network call after session lookup: `stop_hook_active=true`, empty assistant transcript/no projected events, missing transcript, and empty user prompt. This is the same no-timeout risk, not a separate correctness bug.

### Tests

- [OK] `packages/kernel/tests/hooks/autoStream.test.ts` was updated for the new ping call counts and verifies ping-first ordering in the normal assistant and user paths.
- [OK] `packages/kernel/tests/hooks/ping.test.ts` covers successful ping, thrown network failure, and non-2xx best-effort behavior.
- [OK] `packages/kernel/tests/hooks/autoStreamPing.test.ts` adds a focused presence-ping smoke around `runAutoStream`.
- [LOW] There is no direct `runAutoStream` test where the ping fetch rejects and subsequent event POSTs still happen. `postPing`'s own tests prove the helper resolves on failure, so this is low risk, but one integrated test would make the Phase 5 guarantee more explicit.

## Recommendation

Ship Phase 5 as-is for v0.4, with the timeout caveat recorded. I do not see a v0.3.0 event-log regression: the full suite is green at 256 tests, and the existing auto-stream behaviors still project the same event files after the intentional ping.

Recommended follow-up before final v0.4 hardening: add a small timeout to `postPing()` and one integrated autoStream test proving a failed ping does not prevent event posting.

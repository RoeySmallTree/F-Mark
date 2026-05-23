# Phase 7 Buddy Verification - Pane WS Subsystem

## Executive Summary

**Verdict: FAIL**

The in-memory `PaneHub` implements the core steady-state fan-out property: one subscriber set per pane, `onStart` only on the `0->1` transition, and `onStop` only on the `1->0` transition. The isolated `/ws/pane` tests also pass.

However, Phase 7 is not shippable as-is:

- **Critical:** the assembled `createServer()` wiring does not expose `/ws/pane` as a working WebSocket endpoint. A direct smoke check against `createServer({ allowProcessApiNoAuth: true })` returned `Unexpected server response: 500` for `ws://127.0.0.1:<port>/ws/pane`.
- **High:** `startPipe` / `stopPipe` have async lifecycle races that can leak a running `tmux pipe-pane`, leave `pipes` in a stale half-state, or stop a newly-started pipe during rapid unsubscribe/resubscribe.
- **Medium:** stream failure and slow-client backpressure are not handled beyond swallowing errors.
- **Medium:** the tests do not cover the actual `createServer` websocket registration, real hub-to-pipe wiring, resize forwarding, snapshot failure, or close/error unsubscribe behavior.

## Test Results

- `pnpm --filter f-mark test tests/ws/paneHub.test.ts` - **PASS**, 5 tests.
- `pnpm --filter f-mark test tests/ws/pane.test.ts` - **PASS**, 4 tests.
- `pnpm --filter f-mark test` - **PASS**, 59 files / 327 tests.
  - The requested expectation of about 311 tests appears stale for current `main`; the current suite reports 327 passing tests.
- Additional server smoke check:
  - Started `createServer({ token: null, allowProcessApiNoAuth: true })`.
  - Connected a `ws` client to `/ws/pane` with no `session` query.
  - Result: **FAIL**, `Unexpected server response: 500`.

## Spec Coverage

- **One pipe-pane per pane, steady state:** mostly satisfied in source.
  - `packages/kernel/src/ws/paneHub.ts:13` stores subscribers as `Map<string, Set<...>>`.
  - `packages/kernel/src/ws/paneHub.ts:17-22` calls `onStart` only when there was no existing set.
  - `packages/kernel/src/ws/paneHub.ts:23-35` makes unsubscribe idempotent and calls `onStop` only when the set becomes empty.
  - `packages/kernel/src/ws/pane.ts:35` uses one `pipes` map entry per pane.
  - `packages/kernel/src/ws/pane.ts:37-38` makes `startPipe` a no-op when a pipe is already recorded.
- **Endpoint isolation:** source declares separate endpoints, but assembled runtime is broken.
  - Global bus `/ws`: `packages/kernel/src/ws/bus.ts:64-80`.
  - Pane endpoint `/ws/pane`: `packages/kernel/src/ws/pane.ts:59-101`.
  - Server registers both: `packages/kernel/src/server.ts:117-121` and `packages/kernel/src/server.ts:169-181`.
- **Cleanup on disconnect:** source handles it.
  - `packages/kernel/src/ws/pane.ts:99-100` unsubscribes on both `close` and `error`.
  - `packages/kernel/tests/ws/paneHub.test.ts:49-55` covers idempotent unsubscribe.
- **Session validation:** isolated endpoint test covers missing `?session=`.
  - `packages/kernel/src/ws/pane.ts:61-65` closes with code `1008`.
  - `packages/kernel/tests/ws/pane.test.ts:92-97` covers this in the isolated app.
  - But the same behavior fails in the assembled `createServer()` due to the websocket plugin scoping issue below.
- **mkfifo / UTF-8:** acceptable.
  - `packages/kernel/src/ws/pane.ts:22-27` uses `spawn("mkfifo", ...)` and has an `error` handler for missing `mkfifo`.
  - `mkfifo` is available on macOS and Linux.
  - `packages/kernel/src/ws/pane.ts:43` uses `createReadStream(..., { encoding: "utf8" })`; Node stream decoding handles multi-byte UTF-8 split across chunk boundaries.

## Per-File Critique

### `packages/kernel/src/server.ts`

- **CRITICAL - `/ws/pane` is not a working websocket route in the assembled server.**  
  `server.ts:117-121` registers `@fastify/websocket` indirectly inside the scoped global-bus registration, then `server.ts:181` registers the pane websocket separately on `app`. `registerPaneWebSocket` does not register the websocket plugin in that scope. In a real `createServer()` smoke check, connecting to `/ws/pane` returned HTTP 500 instead of a websocket close. The isolated `pane.test.ts` hides this because it registers `websocketPlugin` on the test root at `packages/kernel/tests/ws/pane.test.ts:24-25`.

- **OK - process API gate is present.**  
  `server.ts:155-181` creates the tmux manager, managed-agent routes, pane hub, and pane websocket only when `processApiEnabled` is true.

- **OK - mutation wiring follows the plan shape.**  
  `server.ts:173-181` creates placeholder `pipeControls`, wires hub callbacks to those controls, then assigns the controls returned by `registerPaneWebSocket(app, { tmux, hub: paneHub })`.

### `packages/kernel/src/ws/paneHub.ts`

- **OK - subscriber fan-out semantics are correct in steady state.**  
  `paneHub.ts:13-22` stores one set per pane and starts only on the first subscriber. `paneHub.ts:25-35` makes unsubscribe idempotent and stops only after the last subscriber leaves.

- **LOW - listener exceptions can break fan-out.**  
  `paneHub.ts:38-42` calls each listener directly. If one subscriber callback throws, later subscribers do not receive that chunk. Current websocket listeners catch `socket.send`, so this is not biting today, but the hub itself is not isolated against callback failures.

### `packages/kernel/src/ws/pane.ts`

- **HIGH - async start/stop race can leak or strand pipes.**  
  `pane.ts:37-46` does not record any pending pipe state until after `mkdtemp`, `mkfifo`, `tmux.startPipePane`, and `createReadStream` complete. If the only subscriber disconnects during that window, `stopPipe` at `pane.ts:49-51` sees no pipe and returns; the delayed `startPipe` can then set `pipes` and leave a tmux pipe running with no subscribers. A rapid unsubscribe/resubscribe can also start two pending pipes because `pipes.has(paneId)` does not see in-flight starts.

- **HIGH - stop/start interleaving can stop the wrong generation.**  
  `pane.ts:52-56` deletes the pipe entry before async cleanup finishes. A new subscriber can call `startPipe` while the old `stopPipe` is still awaiting `tmux.stopPipePane`; depending on timing, the old stop can close the newly requested tmux pipe or leave the new `pipes` entry pointing at a FIFO that tmux is no longer writing to.

- **MEDIUM - pipe startup failures leak resources and become unhandled promises.**  
  `pane.ts:39-42` can create a temp dir/FIFO and then fail in `tmux.startPipePane`. There is no `try/finally` cleanup, and `server.ts:178` calls `void pipeControls.startPipe(id)`, so failures are not surfaced to clients and may become unhandled rejections.

- **MEDIUM - stream failures are swallowed and subscribers are not notified.**  
  `pane.ts:43-46` feeds data but only swallows `stream.on("error")`. There is no `end`/`close` handling, no cleanup, and no `{ type: "pane.exit" }` even though the spec lists `pane.exit` as a server message. If the FIFO is destroyed while subscribers are listening, the stream can go silent while the hub still believes the pane is subscribed.

- **MEDIUM - input messages sent immediately after open can be dropped.**  
  `pane.ts:68-82` awaits `tmux.captureSnapshot` before registering the `message` handler. The websocket plugin docs warn handlers should be attached synchronously; a client that sends input/key/resize immediately after open can lose that message while snapshot capture is in progress.

- **MEDIUM - no slow-client backpressure policy.**  
  `pane.ts:78-80` calls `socket.send(...)` for every chunk and does not inspect `socket.readyState`, `socket.bufferedAmount`, send callbacks, or any per-client limit. The hub itself does not buffer, but a slow websocket client can cause unbounded buffering inside `ws` / the socket.

- **OK - snapshot failure closes rather than subscribing.**  
  `pane.ts:68-76` sends `pane.error`, closes with `1011`, and returns before subscribing if `captureSnapshot` fails. This behavior is not covered by tests.

### `packages/kernel/tests/ws/paneHub.test.ts`

- **OK - covers the critical hub property.**  
  `paneHub.test.ts:5-20` verifies multiple subscribers to the same pane trigger one start and one final stop.

- **OK - covers fan-out, pane isolation, no-op feed, and idempotent unsubscribe.**  
  `paneHub.test.ts:22-55`.

### `packages/kernel/tests/ws/pane.test.ts`

- **MEDIUM - does not test the assembled server wiring.**  
  `pane.test.ts:23-33` builds a bespoke Fastify app and registers `websocketPlugin` directly. This misses the actual `createServer()` scoping bug.

- **MEDIUM - does not test real hub callback to pipe controls.**  
  `pane.test.ts:27-33` records `startStops`, but does not wire those callbacks to the returned `startPipe` / `stopPipe`, and does not assert `tmux.startPipePane` / `tmux.stopPipePane`. The key one-pipe property is only tested at the hub level, not at the integrated endpoint/pipe layer.

- **MEDIUM - resize flow is implemented but untested.**  
  `pane.ts:91-92` forwards `pane.resize`, but `pane.test.ts:39-101` only covers snapshot/data, input, key, and missing session.

- **MEDIUM - cleanup behavior is not tested at the websocket layer.**  
  The code unsubscribes on `close` and `error` at `pane.ts:99-100`, but `pane.test.ts` does not assert unsubscribe/stop behavior after client close or socket error.

- **MEDIUM - snapshot failure path is untested.**  
  `pane.ts:72-75` should send `pane.error` and close `1011`, but no test forces `captureSnapshot` to reject.

## Recommendation

Do not accept Phase 7 yet.

Fix the assembled server websocket registration first. The cleanest direction is to register `@fastify/websocket` once in the server scope that owns both `/ws` and `/ws/pane`, or otherwise ensure `registerPaneWebSocket` runs in a scope where the websocket plugin's `onRoute` hook applies. Add a `createServer()`-level websocket test for `/ws/pane` so this cannot regress.

Then harden pipe lifecycle with a per-pane state machine or serialized promise chain:

- record pending `starting` state before the first await;
- make `stopPipe` wait for or cancel pending starts;
- use a generation token so an old stop cannot close a new pipe;
- cleanup temp dirs/FIFOs on every failed startup path;
- notify subscribers or close sockets when the stream errors/closes;
- add a bounded backpressure policy for slow clients.

After that, extend tests to cover assembled `/ws/pane`, resize, close/error cleanup, snapshot failure, startup failure cleanup, and rapid subscribe/unsubscribe/resubscribe races.

## Re-verification (2026-05-23)

Status: PASS

The Phase 7 fix addresses the release-blocking websocket scope bug and the pipe lifecycle races. I found one intentionally deferred hardening item: slow-client backpressure/drop policy is still not implemented. I do not consider that a v0.4 blocker for this phase because the v0.4 Pane I/O release surface requires one pipe per pane, in-memory fan-out, initial snapshot, input/key/resize, and cleanup; the explicit slow-subscriber policy can remain a tracked hardening item unless the terminal overlay is expected to support many remote/slow clients in v0.4.

### Original Findings

- **CRITICAL - `/ws/pane` returned HTTP 500 in the assembled server: addressed.**
  Evidence: `packages/kernel/src/server.ts:126-135` registers `@fastify/websocket` once at the root before registering `/ws`; `packages/kernel/src/ws/bus.ts:63-71` now documents that `registerWebSocket()` requires an existing plugin instead of registering it itself; `packages/kernel/src/ws/pane.ts:134-141` registers `/ws/pane` inside a child plugin after the websocket plugin is available. `packages/kernel/tests/ws/paneIntegration.test.ts:56-60` creates a real `createServer({ token: null, allowProcessApiNoAuth: true, paths })`, listens on a random port, and `packages/kernel/tests/ws/paneIntegration.test.ts:86-96` connects to `/ws/pane?session=fmark-x` and receives `pane.snapshot` without `unexpected-response`. I also ran a one-off `createServer` smoke with default server wiring and temp paths; the WS client emitted `open` (`upgrade=open`), which confirms the route upgrades instead of returning the old 500.

- **HIGH - `startPipe` / `stopPipe` async races: addressed.**
  Evidence: `packages/kernel/src/ws/pane.ts:57-67` creates a per-pane `pipeQueue = createInputQueue()`, and both `startPipe()` and `stopPipe()` run through `pipeQueue.enqueue(paneId, ...)` at `packages/kernel/src/ws/pane.ts:82-83` and `packages/kernel/src/ws/pane.ts:125-126`. This serializes start/start, start/stop, and start/stop/start order per pane.

- **HIGH - wrong-generation stop during rapid resubscribe: addressed.**
  Evidence: because start and stop lifecycle work is serialized per `paneId`, the old stop cannot overlap the new start. `packages/kernel/tests/ws/paneRace.test.ts:99-112` covers the rapid `startPipe`, `stopPipe`, `startPipe` sequence and asserts the tmux call order is exactly `startPipePane`, `stopPipePane`, `startPipePane`.

- **MEDIUM - startup failure leaks FIFO/temp dir: addressed.**
  Evidence: `packages/kernel/src/ws/pane.ts:107-120` rolls back partial startup state, calls `stopPipePane` after a post-`mkfifo` failure, unlinks the FIFO, removes the temp dir, logs, and rethrows. `packages/kernel/tests/ws/paneRace.test.ts:121-146` forces `startPipePane` to fail after `mkfifo` and asserts the observed FIFO path no longer exists.

- **MEDIUM - stream error/end handling: addressed for lifecycle cleanup.**
  Evidence: `packages/kernel/src/ws/pane.ts:94-105` now handles both stream `error` and `end`, logs them, and calls `stopPipe(paneId)`. This fixes the swallowed-stream-failure cleanup issue. The code still does not send a `pane.exit` message to subscribers; I am treating that as a non-blocking follow-up because the requested fix was cleanup on stream failure/end, not a new client-visible exit contract.

- **MEDIUM - missing coverage for resize, close cleanup, snapshot failure, and races: addressed.**
  Evidence: resize is covered in `packages/kernel/tests/ws/pane.test.ts:123-130`; snapshot failure is covered in `packages/kernel/tests/ws/pane.test.ts:148-159`; socket close cleanup is covered in `packages/kernel/tests/ws/pane.test.ts:165-182`; race scenarios are covered in `packages/kernel/tests/ws/paneRace.test.ts:60-71`, `packages/kernel/tests/ws/paneRace.test.ts:80-93`, `packages/kernel/tests/ws/paneRace.test.ts:99-112`, and `packages/kernel/tests/ws/paneRace.test.ts:121-146`.

- **MEDIUM - assembled-server `/ws/pane` test gap: addressed.**
  Evidence: `packages/kernel/tests/ws/paneIntegration.test.ts:54-70` starts the assembled `createServer()` with temp project paths; `packages/kernel/tests/ws/paneIntegration.test.ts:86-96` proves `/ws/pane?session=fmark-x` upgrades and returns a snapshot; `packages/kernel/tests/ws/paneIntegration.test.ts:100-110` proves missing `?session=` closes with `1008`; `packages/kernel/tests/ws/paneIntegration.test.ts:113-133` proves global `/ws` and `/ws/pane` work side by side.

- **MEDIUM - input sent immediately after open can be dropped: not directly addressed.**
  Evidence: `packages/kernel/src/ws/pane.ts:149-163` still awaits `captureSnapshot()` before registering the `message` handler. Existing tests send input/key/resize after receiving the snapshot, so they match the current client contract. I do not consider this a Phase 7 fix blocker, but if the UI sends input before snapshot/ready, the handler should be attached synchronously or early messages should be buffered.

- **MEDIUM - slow-client backpressure/drop behavior: not addressed, accepted as deferred.**
  Evidence: `packages/kernel/src/ws/pane.ts:159-160` still calls `socket.send(...)` for each chunk without checking `readyState`, `bufferedAmount`, callbacks, or a per-client drop/close threshold. The broader review note about preserving ANSI escape boundaries and defining backpressure/drop behavior should remain tracked. I do not require it before proceeding with v0.4 unless v0.4 explicitly promises robust slow-client behavior.

### Test Invocations

```text
$ pnpm --filter f-mark test tests/ws/paneIntegration.test.ts

Test Files  1 passed (1)
Tests       3 passed (3)
```

```text
$ pnpm --filter f-mark test

Test Files  68 passed (68)
Tests       374 passed (374)
```

The requested expectation was around 367 tests after the Phase 7 fix; the current worktree reports 374 passing tests, likely because additional later work is present. I saw no regression in the full `f-mark` suite.

### Recommendation

Proceed to the next phase. Keep slow-client backpressure/drop policy, optional `pane.exit` notification, and pre-snapshot input handling as tracked hardening follow-ups, but they do not block acceptance of the Phase 7 fix.

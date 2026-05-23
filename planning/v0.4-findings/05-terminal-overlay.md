# v0.4 Terminal Overlay + Pane WS — Adversarial Findings

**Subagent:** E  
**Port:** 17914  
**Date:** 2026-05-23  
**Overall:** 1 P0 kernel-crash bug, 3 bugs/gaps, several minor observations  

---

## Summary

| Section | Tests | PASS | FAIL | INFO |
|---|---|---|---|---|
| E.1 Multi-tab fan-out | 10 | 8 | 2* | 1 |
| E.2 UTF-8 + binary safety | 6 | 6 | 0 | 0 |
| E.3 High-throughput streams | 4 | 3 | 0 | 1 |
| E.4 Resize behavior | 6 | 3 | 0 | 3 |
| E.5 Lifecycle | 7 | 5 | 2 | 1 |
| E.6 Commands while overlay open | 6 | 5 | 0 | 1 |
| E.7 Permission injection | 5 | 5 | 0 | 0 |
| E.8 Detach vs Kill | 7 | 7 | 0 | 0 |
| E.9 Malformed WS messages | 7 | 5 | 0 | 2 |
| E.10 Auth on /ws/pane | 5 | 5 | 0 | 0 |
| E.11 Fan-out timing | 3 | 2 | 1 | 0 |

*E.1 FAILs were a test script bug (literal `\r` in pane.input data rejected by validateMessageText); fan-out was subsequently confirmed working by a standalone test.

---

## P0 — Kernel crash on external tmux session kill

**Test:** E.5 — External tmux kill while WS subscriber is open  
**Severity:** P0 — crashes the Node.js process, takes down the entire server  
**Reproduced:** 100% (every external kill of a subscribed pane triggers it)

### What happens

1. A WS client subscribes to pane `fmark-…-term-N` via `/ws/pane`
2. `hub.subscribe(paneId, cb)` fires `onStart(paneId)` which calls `pipeControls.startPipe(id)` — but the call is wrapped in `void …` (fire-and-forget) in `server.ts:225`
3. `startPipe` enqueues an async task that calls `tmux.startPipePane(paneId, fifo)` → throws `Error: tmux pipe-pane failed: can't find pane: <paneId>` when the session is dead
4. The thrown error propagates out of the `pipeQueue.enqueue` callback and becomes an **unhandled promise rejection**
5. Node.js crashes with an uncaught exception

### Crash log (kernel.log)

```
Error: tmux pipe-pane failed: can't find pane: fmark-f-mark-ee7a0c7a-term-6
    at Object.startPipePane (dist/tmux/manager.js:103:23)
    at async dist/ws/pane.js:68:17
Node.js v24.15.0
```

### Root cause in source

`/packages/kernel/src/server.ts`, lines 224-225:
```typescript
const paneHub = createPaneHub({
  onStart: (id) => { void pipeControls.startPipe(id); },  // ← unhandled rejection
  onStop:  (id) => { void pipeControls.stopPipe(id); },
});
```

The `startPipe` function correctly catches errors internally (logs `pane startPipe failed`) but re-throws them at line 102. The `void` wrapper discards the promise, so the re-thrown error becomes an unhandled rejection.

### Secondary consequence

After the crash, all FIFO tmpfiles created by previous connections are left behind (`/tmp/fmark-pipe-*`). Testing produced 241 orphaned FIFO directories. If the crash happens repeatedly before cleanup, `EMFILE: too many open files` will prevent the kernel from restarting (chokidar hits the watch limit). Observed in the test run when the kernel failed on the second restart attempt.

### Fix

Either:
a) In `server.ts`, catch the rejection from `startPipe`:
   ```typescript
   onStart: (id) => { void pipeControls.startPipe(id).catch(() => {}); },
   ```
b) Or, change `startPipe` to not re-throw when `startPipePane` fails — log and return gracefully. The subscriber should receive a `pane.error` message rather than causing a kernel crash.

---

## Bug — No pane.exit or pane.closed notification after tmux session dies

**Test:** E.5 — External kill, E.11 — late subscriber mid-stream  
**Severity:** P1 — poor UX; overlay stays open with no indication the session is gone

### What happens

1. Terminal WS overlay is open, FIFO stream is flowing
2. `tmux kill-session` is run externally
3. The overlay WS stays at `readyState: 1` (OPEN) — no `pane.exit` or `pane.closed` message is ever sent
4. The xterm.js terminal goes silent; the user has no visual feedback

### Why

The FIFO stream's `'end'` event would fire when tmux closes the pipe, which triggers `stopPipe`. But if the kernel crashes first (due to the P0 above), cleanup never happens. Even without a kernel crash, the stream `'end'` event does not send any notification to the WS client — it just calls `stopPipe`. There is no code path that sends `{ type: "pane.exit" }` or `{ type: "pane.closed" }` to the client.

The xtermBridge only handles `pane.snapshot`, `pane.data`, and `pane.error` — there is no protocol message for session exit.

---

## Bug — Late subscriber misses mid-stream data

**Test:** E.11 — Late subscriber mid-stream  
**Severity:** P2 — second tab that joins while a command is running gets no buffering

### What happens

1. Tab 1 opens overlay, runs `for i in $(seq 100); do echo LINE_$i; done`
2. Tab 2 opens the overlay 200ms later (mid-stream)
3. Tab 2 receives the initial `pane.snapshot` but then gets **0 data chunks** from the ongoing command

### Root cause

There is no per-pane output ring buffer. The `hub.feed()` delivers chunks to current subscribers only (`for (const fn of set) fn(chunk)`). Any subscriber that wasn't present when a chunk arrived will never see it. The snapshot is a static capture from tmux's history; live chunks are real-time only.

This is expected behavior for a simple pub-sub hub, but the spec headline claims "multi-tab fan-out" — new tabs do miss any data between snapshot and subscription.

---

## Bug — pane.resize with NaN cols/rows forwarded to tmux (E.9 — partial)

**Test:** E.9  
**Severity:** P2 — tmux rejects with "width invalid" but the error propagates; this is acceptable behavior but no kernel-side guard exists

### What happens

`pane.resize` with `cols: "abc"` → `Number("abc") = NaN` → forwarded to `tmux.resize(paneId, NaN, NaN)` → tmux returns `"width invalid"` → propagated as `pane.error`.

The kernel does not validate that `cols`/`rows` are valid integers before forwarding. tmux happens to reject gracefully, but this is an implicit dependency on tmux's own input validation.

---

## Finding — 100KB pane.input rejected by tmux, not by kernel

**Test:** E.9  
**Severity:** Low (doesn't crash; tmux returns `command too long`)

`validateMessageText` has no length limit. A 100KB `pane.input` payload passes validation and is forwarded to `tmux send-keys`. tmux rejects it with `"tmux send-keys failed: command too long"` and this is propagated as `pane.error`. The kernel is not the first line of defense here.

---

## Finding — Binary WS frames silently discarded

**Test:** E.9  
**Severity:** Informational

Binary WebSocket frames (not UTF-8 text frames) are received by the kernel's `message` handler as `Buffer`. `raw.toString()` on random bytes fails `JSON.parse`, which silently returns. No `pane.error` is sent. Kernel stays alive. Acceptable behavior.

---

## Finding — FIFO resource leak on kernel crash

**Test:** E.5 consequence  
**Severity:** P1 (operational) — in production with repeated crashes, the system can be rendered unrestartable

After the P0 crash, 241 `/tmp/fmark-pipe-*` directories were left behind. Each contains a named pipe (FIFO file). A second kernel restart attempt failed with `EMFILE: too many open files` from chokidar.

Mitigation: add a startup-cleanup pass that removes orphaned `/tmp/fmark-pipe-*` directories, or track FIFOs persistently and clean them on startup.

---

## Observations (INFO)

### E.3 — FIFO stream cleanup on mid-stream WS drop

When a WS client disconnects mid-stream (drop), `sub.unsubscribe()` fires, decrementing the hub subscriber count. If count reaches 0, `onStop` fires `stopPipe`. The pipe teardown should work; however, the kernel log showed no "pane stream ended" or "stream error" log after the WS drop test. This suggests either (a) the log level for "pane stream ended" is Debug and not visible in the default log output, or (b) the FIFO read stream continues running and the pipe-pane is still active with no reader (FIFO backpressure). Needs investigation.

### E.4 — Resize extremes

- `pane.resize {cols: 0, rows: 0}`: rejected with `tmux resize-window failed: width too small`
- `pane.resize {cols: 1, rows: 1}`: **accepted** by tmux (may cause tmux rendering issues)
- `pane.resize {cols: 9999, rows: 9999}`: **accepted** by tmux
- URL params `cols=10&rows=3` (below the `cols>=20 && rows>=5` guard): correctly skips initial resize

No kernel-side clamp on resize dimensions other than the URL-param guard. All validation is delegated to tmux.

### E.5 — Nonexistent pane

Connecting to a nonexistent session: snapshot attempt fails → `pane.error` is sent → WS closes with code 1011. Correct behavior.

### E.6 — Unknown pane.key name

`pane.key` with key name `"nonexistent-key-xyz-12345"` is forwarded to `tmux send-keys` without error. tmux silently discards unknown named keys.

### E.7 — Session ID with semicolon

A session ID containing `;` (URL-encoded as `%3B` but the test sent literal `fmark-t-bad;id`) reaches tmux as-is. tmux `capture-pane -t fmark-t-bad;id` treats it as a shell expression and fails with "can't find pane". This does not execute arbitrary commands (capture-pane is not a shell command), but the error message leaks the raw session ID to the client.

---

## What works correctly

- **Fan-out**: Multiple WS subscribers on the same pane all receive the same output chunks in real-time (verified by explicit standalone test after fixing test script bug)
- **UTF-8 and emoji**: Multi-byte CJK characters and emoji render correctly through the FIFO
- **ANSI/control validation**: `validateMessageText` correctly blocks chars `< 0x20` (except tab) and `0x7f`; only tab (`0x09`) is allowed through
- **Auth**: No-token and wrong-token WS connections rejected with 401 before protocol upgrade
- **Bearer header auth**: `Authorization: Bearer <token>` in WS upgrade headers also accepted
- **Session param validation**: Missing `session` param → close 1008 with clear reason
- **inputQueue serialization**: Rapid-fire `pane.input`/`pane.key`/`pane.resize` are serialized through the per-pane queue; no byte-level interleaving observed
- **Detach/reconnect**: WS close (detach) leaves tmux session alive; reconnect gets fresh snapshot with session history intact
- **Path traversal session IDs**: `../../etc/passwd` style session IDs reach tmux which reports "can't find pane"; no filesystem traversal occurs
- **High-throughput**: 10,000-line `yes | head` stream handled without kernel instability; 30KB in 18 chunks in 5 seconds
- **Large file streaming**: `/etc/passwd` streamed without issues

---

## Test artifacts

- Test scripts: `/tmp/fmark-E/test-e.js`, `/tmp/fmark-E/test-e2.js`
- First run output: `/tmp/fmark-E/kernel.log` (contains crash trace)
- Second run output: `/tmp/fmark-E/kernel4.log` (clean)
- FIFO cleanup required between runs: 241 orphaned `/tmp/fmark-pipe-*` dirs created by crash

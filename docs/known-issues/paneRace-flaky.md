# Flaky: `tests/ws/paneRace.test.ts` — 2 of 4 tests time out intermittently

**Status:** diagnosed, not fixed. Pre-existing; not introduced by the 2026-08-05 work.

## Reproduction rate

Measured 2026-08-05 on `main`, Node 20.20.2:

| Scope                    | Rate                                                   |
| ------------------------ | ------------------------------------------------------ |
| Full kernel suite        | ~1 run in 9 shows 43 failures instead of the stable 41 |
| `paneRace.test.ts` alone | ~1 run in 5                                            |

It reproduces in isolation, so it is **not** cross-test interference. The file is racy on its own.

## Which tests

Always these two, always together:

- `cleans up temp dir + FIFO when startPipePane fails after mkfifo`
- `does not stop the wrong generation when start/stop/start interleave`

The other two in the file have never been observed failing.

## The failure

`Error: Test timed out in 15000ms` — a **hang**, not a wrong assertion. The file already carries a raised
`RACE_TIMEOUT = 15_000` with a comment noting earlier flakiness under load, so this has been papered
over once already. Raising it again would be the wrong move: 15s is far past any legitimate duration
for these tests, so whatever is happening is a stall, not slowness.

## What is established

`src/ws/pane/pipeController.ts`:

- `startPipeNow` creates a real FIFO, then `openPipeStream` calls `createReadStream(fifoPath)`.
- **Opening a FIFO for reading does not complete until some process opens it for writing.** In these
  tests `tmux` is a mock, so nothing ever writes. The read stream's open therefore stays pending for
  the whole test.
- `tearDown` calls `stream.destroy()` **without awaiting** and does not await stream close, so
  `tearDown` itself is not an obvious blocker.
- `openPipeStream` registers `stream.on("error"| "end", () => void this.stopPipe(paneId))`, and
  `stopPipe` re-enters `pipeQueue.enqueue(paneId, …)`. Destroying a stream whose open is still
  pending can emit `error`, which re-enters the same per-pane queue that the current teardown is
  running inside.

## What is NOT established

Whether the stall is in the re-entrant `stopPipe` from the stream error handler, or in `app.close()`
waiting on a pending FIFO open fd that keeps the event loop alive. Both are consistent with the
evidence. **Do not patch either on a guess** — this is concurrency code around real file descriptors,
and a speculative fix that merely moves the race would be worse than the current known flake.

## Suggested next step

Instrument, do not theorise. Run the file with `--reporter=verbose` and `NODE_DEBUG=stream,fs`, or
add a temporary `console.error` at the entry and exit of `stopPipeNow`, `tearDown` and the test's
`finally`, then catch a failing run. That pins which await never settles in under ten minutes of
looping, which is cheaper than reasoning about it further.

## Why it may matter beyond the test

If the stall is real rather than an artefact of the mock, the production shape is: a pane whose FIFO
never gets a writer — tmux failed to attach, or the pane died between `mkfifo` and `startPipePane` —
could hang a pipe stop. That is worth knowing before dismissing this as test-only noise.

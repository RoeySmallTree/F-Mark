# seqLog — Backend Seq Logging Utility

> **Project name:** `f-mark`
> **Seq ingestion API:** `http://localhost:5455` (logs POSTed here)
> **Seq UI (for filtering / searching logs):** `http://localhost:5454`
>
> Every event sent by this util is tagged with `app: "f-mark"` and `layer: "backend"`. In the Seq UI, filter by `app = 'f-mark'` and `layer = 'backend'` to see only logs from this app's kernel.

## Import

```ts
import { seqLog, LogLevel } from "./lib/seq-log";
// or, from elsewhere in the kernel:
import { seqLog, LogLevel } from "../lib/seq-log";
```

## Signature

```ts
seqLog(message: string): Promise<void>;
seqLog(message: string, props: Record<string, unknown>): Promise<void>;
seqLog(message: string, level: LogLevel): Promise<void>;
seqLog(message: string, props: Record<string, unknown>, level: LogLevel): Promise<void>;
```

When `level` is omitted it defaults to `LogLevel.Debug`. The function never throws — network or Seq errors are swallowed.

You can `await` it when you need to be certain the event was dispatched before continuing (e.g. before process exit), or fire-and-forget by ignoring the promise.

## Log levels

Use the `LogLevel` enum exported from this file.

- `LogLevel.Verbose` — very fine-grained tracing; almost always filtered out.
- `LogLevel.Debug` — developer-oriented diagnostics. **Default level.**
- `LogLevel.Info` — normal, expected lifecycle events (server started, request handled, job completed).
- `LogLevel.Warning` — something unexpected but recoverable (retry succeeded, deprecated path hit).
- `LogLevel.Error` — a request or job failed in a way that matters.
- `LogLevel.Fatal` — the process is about to die / unrecoverable state. **Backend only.**

## The static-message rule

The `message` argument **must be a static string literal**. Never interpolate dynamic values into it.

Dynamic data goes in `props`. Seq groups events by message template, so a static template keeps related events grouped and searchable.

```ts
// Bad — every session id produces a new message template
await seqLog(`Session ${sessionId} started`);

// Good — one template, sessionId is a structured property
await seqLog("Session started", { sessionId });
```

## Reserved props

Two property keys are special and are stripped from the outgoing event before the rest of `props` is emitted:

- **`$note`** — an assertion string describing what the surrounding values *should* be. Renamed to `note` on the emitted event. Use this to capture intent at the call site so a reader of the log later understands what the code expected.
- **`$hideWhen`** — boolean. When truthy, the log call is fully suppressed (nothing is sent). Useful for conditional logging without an `if` wrapper at the call site.

## Examples

### Basic usage in a route handler

```ts
import { seqLog, LogLevel } from "../lib/seq-log";

fastify.post("/projects", async (req, reply) => {
  await seqLog("Create project requested", { ip: req.ip }, LogLevel.Info);
  try {
    const project = await createProject(req.body);
    await seqLog(
      "Project created",
      { projectId: project.id, $note: "Project row exists in DB" },
      LogLevel.Info,
    );
    return project;
  } catch (err) {
    await seqLog("Create project failed", { error: String(err) }, LogLevel.Error);
    reply.code(500);
    return { error: "create_failed" };
  }
});
```

### Fire-and-forget (no await)

```ts
void seqLog("Websocket connected", { clientId });
```

### Conditional logging with `$hideWhen`

```ts
// Only log if we're in noisy-tracing mode
await seqLog("Tick", { count, $hideWhen: !process.env.TRACE });
```

### Default Debug level (level omitted)

```ts
await seqLog("Cache miss", { key });
// sent at LogLevel.Debug
```

### Fatal before exit

```ts
await seqLog("Database unreachable, shutting down", { error: String(err) }, LogLevel.Fatal);
process.exit(1);
```

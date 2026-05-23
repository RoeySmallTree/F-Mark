# useSeqLog — Frontend Seq Logging Hook

> **Project name:** `f-mark`
> **Seq ingestion API:** `http://localhost:5455` (logs POSTed here)
> **Seq UI (for filtering / searching logs):** `http://localhost:5454`
>
> Every event sent by this hook is tagged with `app: "f-mark"` and `layer: "frontend"`. In the Seq UI, filter by `app = 'f-mark'` and `layer = 'frontend'` to see only logs from this app's renderer.

## Import

```ts
import { useSeqLog, LogLevel } from "@/hooks/useSeqLog";
// or via relative path, e.g.:
import { useSeqLog, LogLevel } from "../hooks/useSeqLog";
```

## Hook signature

```ts
const log = useSeqLog(component: string, context?: Record<string, unknown>);
```

- `component` — a string identifying the component or hook the logger belongs to. Attached as `component` on every event emitted by this `log` function.
- `context` — optional object of additional properties merged into every event emitted by this `log`.

The returned `log` function:

```ts
log(message: string): void;
log(message: string, props: Record<string, unknown>): void;
log(message: string, level: LogLevel): void;
log(message: string, props: Record<string, unknown>, level: LogLevel): void;
```

When `level` is omitted it defaults to `LogLevel.Debug`.

## Log levels

Use the `LogLevel` enum exported from this file.

- `LogLevel.Verbose` — very fine-grained tracing; almost always filtered out.
- `LogLevel.Debug` — developer-oriented diagnostics. **Default level.**
- `LogLevel.Info` — normal, expected lifecycle events worth recording (renders, navigation, user actions).
- `LogLevel.Warning` — something unexpected happened but the UI recovered.
- `LogLevel.Error` — a failure the user is likely to notice (request failed, render threw, etc.).

## The static-message rule

The `message` argument **must be a static string literal**. Never interpolate dynamic values into it.

Dynamic data goes in `props`. Seq groups events by message template, so a static template keeps related events grouped and searchable.

```ts
// Bad — every user gets its own message template
log(`User ${userId} clicked save`);

// Good — one template, dynamic userId is a structured property
log("User clicked save", { userId });
```

## Reserved props

Two property keys are special and are stripped from the outgoing event before the rest of `props` is emitted:

- **`$note`** — an assertion string describing what the surrounding values *should* be. Renamed to `note` on the emitted event. Use this to capture intent at the call site so a reader of the log later understands what the code expected.
- **`$hideWhen`** — boolean. When truthy, the log call is fully suppressed (nothing is sent). Useful for conditional logging without an `if` wrapper at the call site.

## Examples

### Basic usage in a component

```tsx
import { useSeqLog, LogLevel } from "../hooks/useSeqLog";

export function SaveButton({ projectId }: { projectId: string }) {
  const log = useSeqLog("SaveButton", { projectId });

  const onClick = async () => {
    log("Save clicked", LogLevel.Info);
    try {
      await save(projectId);
      log("Save succeeded", { $note: "Project persisted to disk" }, LogLevel.Info);
    } catch (err) {
      log("Save failed", { error: String(err) }, LogLevel.Error);
    }
  };

  return <button onClick={onClick}>Save</button>;
}
```

### Conditional logging with `$hideWhen`

```tsx
const log = useSeqLog("Canvas");

function onPointerMove(e: PointerEvent) {
  // Only log when we are actively dragging something
  log("Pointer moved", { x: e.clientX, y: e.clientY, $hideWhen: !isDragging });
}
```

### Default Debug level (level omitted)

```tsx
const log = useSeqLog("ParticipantList");

useEffect(() => {
  log("Mounted", { count: participants.length });
  // sent at LogLevel.Debug
}, []);
```

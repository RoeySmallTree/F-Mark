# A0 — Assistant Output Hook (🛑 BLOCKER)

**Verdict: PASS** — Architecture viable with simple in-plugin role lookup.

## Setup
- opencode v1.15.11 (locally bundled SDK plugin v1.14.33)
- Probe plugin loaded from `~/.config/opencode/plugin/probe.ts`
- Command: `opencode run --print-logs "say only the word PROBE-OK"`
- Model used: openai/gpt-5.3-codex (default)

## Event taxonomy observed (28 `event` calls, 1 `chat.message`)

| Event type | Count | Purpose |
|---|---|---|
| `message.part.updated` | 5 | Carries text content (both user and assistant) — KEY EVENT for A0 |
| `message.updated` | 5 | Carries `info.role` ("user"/"assistant"), `info.finish`, totals |
| `message.part.delta` | 4 | Streams tokens (field=text, delta=chunk) — optional for streaming |
| `session.idle` | 1 | End-of-turn signal — A4 PARTIAL confirm |
| `session.status` | 4 | Status transitions |
| `session.updated` | 4 | Cumulative session info |
| `session.created` | 1 | Fired on this fresh session |
| `session.diff` | 1 | File diff associated with session |
| `session.next.{agent,model}.switched` | 1 each | Mode/model selection |
| `server.instance.disposed` | 1 | Cleanup |

`chat.message` fired ONCE — confirmed it's the USER side (per SDK types `UserMessage`).

## Assistant text — payload shape

```jsonc
// event.type === "message.part.updated"
{
  "type": "message.part.updated",
  "properties": {
    "sessionID": "ses_196e9e928ffeEZ6Go6H4rxO0T1",
    "part": {
      "id": "prt_e69162166001UlC9eAyrBMiNCO",
      "messageID": "msg_e69161b1a001ts3yVaMQgu2Bul",   // join key for role lookup
      "sessionID": "ses_196e9e928ffeEZ6Go6H4rxO0T1",
      "type": "text",
      "text": "PROBE-OK",                              // accumulated text
      "time": {
        "start": 1779879518566,
        "end":   1779879518809                         // PRESENCE = finalized
      },
      "metadata": { "openai": { "phase": "final_answer" } }
    },
    "time": 1779879516930
  }
}
```

## User vs Assistant differentiation

`message.part.updated` carries text from BOTH sides. To filter assistant-only:

**Option chosen (simple + robust)**: track a `Map<messageID, role>` populated by `message.updated` events (`info.id` → `info.role`). On `message.part.updated`, look up role; post only if `assistant`.

Alternative ("if `part.time?.end` exists → assistant"): the first observation supports this — user-prompt parts have `time: null, metadata: null`, assistant final has `time: {start, end}`. But this is fragile across vendors; role lookup is the right pattern.

## Finalization signal

**`part.time?.end` presence** = the text part is complete (agent finished writing this part). Streamlined: skip all updates where `part.time?.end` is undefined.

For delta-mode streaming (future): consume `message.part.delta` events with `{messageID, partID, field: "text", delta: "<chunk>"}`. Not needed for v1 (post-once-final is enough).

## Session ID format

`ses_196e9e928ffeEZ6Go6H4rxO0T1` — `ses_` prefix + alphanumeric. Safe for filename/path (A12 confirmed).

## `info.finish` values seen

- `"stop"` — normal completion (assistant message arrived)
- Other values not yet observed (need error/interrupt scenarios — A4 step)

## Plan impact

**Plugin template update (Phase 1)**:
- Replace the `t === "message.part.updated" || t === "message.updated"` branch with:
  ```typescript
  const messageRole = new Map<string, "user" | "assistant" | "system">();
  // ...
  if (t === "message.updated") {
    const role = (event as any).properties?.info?.role;
    const id = (event as any).properties?.info?.id;
    if (typeof id === "string" && typeof role === "string") messageRole.set(id, role as any);
    return;
  }
  if (t === "message.part.updated") {
    const part = (event as any).properties?.part;
    if (part?.type !== "text") return;
    if (!part?.time?.end) return; // not finalized yet
    if (messageRole.get(part.messageID) !== "assistant") return; // skip user echo
    // post prose
  }
  ```
- Keep `chat.message` removed from the prose path (already done per review_1).

**Stop conditions** — none triggered. A0 PASS unblocks Phase 1.

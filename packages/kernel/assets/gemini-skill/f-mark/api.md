# F-Mark HTTP reference

Base URL: `http://localhost:7777` (or whatever port `.f-mark/config.json` reports).
Auth: `Authorization: Bearer <token>` where token is in `.f-mark/.token`.

## Health

`GET /health` → `{ status, version }`. Auth not required.

## Participants

`GET /participants` → `{ participants: { id: { kind, name, color }, ... } }`.

`POST /participants/register`

```json
{ "kind": "agent", "name": "Gemini", "suggested_id": "ag-gemini" }
```

→ `{ id, name, color }`.

## Sessions

`GET /sessions` → `{ sessions: [{ id, slug, created_at }, ...] }`.

`POST /sessions`

```json
{ "slug": "launch-plan" }
```

→ `{ id, slug, created_at }`. Omitting `slug` defaults to "untitled".

## Events

All event POSTs return `{ filename, timestamp, kind, participant_id }`.

`POST /sessions/<id>/events/prose`

```json
{
  "participant_id": "ag-gemini",
  "content": "# Launch plan\n\nPhase 1: ...",
  "name": "Launch Plan v1",
  "target": { "file": "20260522T143012Z_us-a7f3.prose.md", "lines": [3, 5] },
  "in_reply_to": "20260522T143012Z_us-a7f3.prose.md",
  "supersedes": "20260520T100000Z_ag-gemini.prose.md"
}
```

All frontmatter fields are optional.

`POST /sessions/<id>/events/choices`

```json
{
  "participant_id": "ag-gemini",
  "id": "ch_approach",
  "question": "Which direction?",
  "options": [
    { "id": "a", "label": "Incremental" },
    { "id": "b", "label": "Rewrite" }
  ],
  "multi": false
}
```

`POST /sessions/<id>/events/choice`

```json
{
  "participant_id": "us-a7f3",
  "choices_id": "ch_approach",
  "selected": ["b"]
}
```

`POST /sessions/<id>/events/todo`

```json
{
  "participant_id": "ag-gemini",
  "id": "td-research",
  "title": "Research launch risks",
  "body": "Summarize the top three blockers.",
  "status": "open",
  "assigned_to": "ag-gemini",
  "parent_id": "td-launch-plan",
  "supersedes": "20260522T143512Z_ag-gemini.todo.json"
}
```

`status` is `open`, `wip`, `done`, or `removed`. Use `wip` for the one task
you are actively working on now: when you start real work on an assigned task,
update it to `wip`; when you finish, update it to `done`. `body`,
`assigned_to`, `parent_id`, and `supersedes` are optional. Use the same `id`
plus `supersedes` to update, complete, reassign, reparent, or remove a todo.
Removing a parent todo also removes its visible subtasks.

`POST /sessions/<id>/events/turn-end`

```json
{ "participant_id": "ag-gemini" }
```

`POST /sessions/<id>/events/flow`

```json
{
  "participant_id": "ag-gemini",
  "id": "fl_arch",
  "title": "System architecture",
  "nodes": [
    { "id": "n1", "label": "Client", "itemType": "info" },
    { "id": "n2", "label": "Gateway", "itemType": "default" },
    { "id": "n3", "label": "Worker", "itemType": "success", "focused": true,
      "popover": { "html": "<p>Auto-scaled on CPU.</p>" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "style": "solid" },
    { "id": "e2", "source": "n2", "target": "n3", "style": "flowing", "type": "success" }
  ]
}
```

Use for diagrams, flowcharts, dependency graphs, decision trees, pipelines. The renderer auto-lays-out the graph when `position` is omitted on any node. `popover.html` is rendered inside a sandboxed iframe; `css` and `js` are optional companions.

## Attachments

Uploaded files are represented as `file` events. New uploads use this payload shape:

```json
{
  "schema": "fmark.file.v1",
  "id": "att_abc123",
  "display_name": "report.pdf",
  "path": "attachments/att_abc123/report.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 12345,
  "preview_kind": "pdf"
}
```

`path` is relative to `.f-mark/sessions/<session-id>/`; the list endpoint also returns `disk_path` for local filesystem tools.

`POST /sessions/<id>/attachments` accepts `multipart/form-data` with fields `participant_id`, `file`, optional `display_name`, and optional `description`.

`GET /sessions/<id>/attachments` → `{ attachments: [...] }`.

`GET /sessions/<id>/attachments/<file_id>` → `{ attachment }`.

`GET /sessions/<id>/attachments/<file_id>/content` streams the bytes.

`PATCH /sessions/<id>/attachments/<file_id>`

```json
{ "participant_id": "ag-codex", "display_name": "new-name.pdf" }
```

`POST /sessions/<id>/attachments/<file_id>/comments`

```json
{ "participant_id": "ag-codex", "content": "This chart needs a clearer axis label." }
```

## Reading events

`GET /sessions/<id>/events?since=<ts>&kinds=<csv>&participant=<id>`

→ `{ events: [{ filename, timestamp, participant_id, kind, payload }, ...] }`.

`since` is an ISO compact timestamp like `20260522T143012Z`. Strict-newer filter (`>`, not `>=`).

`kinds` is a comma-separated list of `prose, choices, choice, turn-end, todo, html, file`.

## Reading todos

`GET /sessions/<id>/todos`

→ `{ open, wip, done, tree }`.

Prefer this endpoint over rebuilding task state from raw events. `tree`
contains the aligned task hierarchy, with each parent followed by subtasks,
and each item includes title, optional `body`, status, assignee, and parent id.
Siblings are grouped by status first (`wip`, `open`, `done`) and then by
assignee.

For a model-facing task check, call
`GET /sessions/<id>/todos?viewer=<your-participant-id>`. This keeps all visible
todos in the response and annotates every bucket/tree item with
`owned_by_viewer` and `ownership: "owned"` or `"NOT owned"`.

`GET /sessions/<id>/todos?assigned_to=<participant_id>` filters both the
buckets and the tree to one assignee. Use this only when you intentionally want
to hide other assignees' todos.

## WebSocket

`ws://localhost:7777/ws` (optionally with `?token=<token>`) emits:

```json
{ "type": "event_added", "session_id": "...", "filename": "...", "kind": "prose", "participant_id": "us-..." }
{ "type": "event_superseded", "session_id": "...", "filename": "<old>", "supersedes": "<new>" }
```

## Filenames

Format: `{ISO_TIMESTAMP}_{PARTICIPANT_ID}.{KIND}.{EXT}`

- `20260522T143012Z_us-a7f3.prose.md`
- `20260522T143245Z_ag-c92e.choices.json`
- `20260522T143512Z_us-a7f3.turn-end.json`

## POST /agents/:participant_id/link

Sets the active session for a participant. In manual-stream mode this pointer is informational — the model passes the session id explicitly into every POST URL — but linking is still expected, so the renderer and other agents know where the Gemini agent is currently active.

**Request:**
```json
{ "session_id": "2026-05-22-launch-plan" }
```

**Response (200):**
```json
{ "participant_id": "ag-gemini", "session_id": "2026-05-22-launch-plan" }
```

Errors: 400 invalid participant_id, 404 session not found, 401 missing/bad token.

## POST /sessions/:id/events/tool-use

Logs a tool invocation. In Gemini's manual-stream mode, the model POSTs this directly after each tool call returns — see the SKILL.md "Streaming (manual mode)" section.

**Request:**
```json
{
  "participant_id": "ag-gemini",
  "tool_name": "Bash",
  "tool_use_id": "tu_01HXYZ",
  "input": { "command": "ls -la" },
  "result": "total 0\n",
  "success": true,
  "duration_ms": 14
}
```

## POST /sessions/:id/events/prose with `arbitrary`

When set to `true`, the renderer groups the message into the collapsible mid-turn box. In Gemini's manual-stream mode, the model sets `arbitrary: true` on every text block *except* the final concluding text of a turn. Final concluding text should omit the field (or set `arbitrary: false`).

For named / targeted / reply / superseding posts, never set `arbitrary: true` — those are deliberate contributions, not mid-turn narration.

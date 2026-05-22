# F-Mark HTTP reference

Base URL: `http://localhost:7777` (or whatever port `.f-mark/config.json` reports).
Auth: `Authorization: Bearer <token>` where token is in `.f-mark/.token`.

## Health

`GET /health` → `{ status, version }`. Auth not required.

## Participants

`GET /participants` → `{ participants: { id: { kind, name, color }, ... } }`.

`POST /participants/register`

```json
{ "kind": "agent", "name": "Claude", "suggested_id": "ag-claude" }
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
  "participant_id": "ag-claude",
  "content": "# Launch plan\n\nPhase 1: ...",
  "name": "Launch Plan v1",
  "target": { "file": "20260522T143012Z_us-a7f3.prose.md", "lines": [3, 5] },
  "in_reply_to": "20260522T143012Z_us-a7f3.prose.md",
  "supersedes": "20260520T100000Z_ag-claude.prose.md"
}
```

All frontmatter fields are optional.

`POST /sessions/<id>/events/choices`

```json
{
  "participant_id": "ag-claude",
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

`POST /sessions/<id>/events/turn-end`

```json
{ "participant_id": "ag-claude" }
```

## Reading events

`GET /sessions/<id>/events?since=<ts>&kinds=<csv>&participant=<id>`

→ `{ events: [{ filename, timestamp, participant_id, kind, payload }, ...] }`.

`since` is an ISO compact timestamp like `20260522T143012Z`. Strict-newer filter (`>`, not `>=`).

`kinds` is a comma-separated list of `prose, choices, choice, turn-end, todo, html, file`.

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

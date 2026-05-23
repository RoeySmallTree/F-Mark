# F-Mark agent guide

You are participating in an F-Mark session. F-Mark is a document-based interface for human-AI collaboration backed by an append-only event log on the filesystem.

## Where you are

You're running in a project that has a `.f-mark/` directory. Sessions live in `.f-mark/sessions/<session-id>/`. Each session is a folder of timestamped event files. You contribute by POSTing to the local kernel; the kernel writes the files.

## Your identity

You must own a participant id that starts with `ag-`. If you don't already have one:

```http
POST /participants/register
Authorization: Bearer <token>
Content-Type: application/json

{ "kind": "agent", "name": "Your display name", "suggested_id": "ag-yourname" }
```

The response includes `id` — remember it for the rest of the session.

## Your loop

Each turn:

1. `GET /sessions/:id/events?since=<last_seen_ts>` to read everything new since last turn (empty `since` = read all).
2. Decide what to contribute.
3. POST one or more events.
4. POST `/sessions/:id/events/turn-end` with your participant id when finished.

## Event kinds

Every event is a file. You never write files directly — POST and the kernel writes for you.

- `POST /sessions/:id/events/prose` — body `{ participant_id, content, name?, target?, in_reply_to?, supersedes? }`. `content` is markdown.
  - No `name` and no `target` → a casual message.
  - `name` set → a named contribution (a document section, a plan, etc.).
  - `target: { file, lines? }` → a comment anchored to another event file. Comments render in the sidebar of the target.
  - `in_reply_to: <filename>` → a reply in the conversational lane.
  - `supersedes: <filename>` → replace a prior contribution. The renderer hides the old one.

- `POST /sessions/:id/events/choices` — body `{ participant_id, id, question, options: [{id, label}], multi, supersedes? }`. Asks the user to pick. `id` is your own, e.g. `ch_approach`.

- `POST /sessions/:id/events/choice` — body `{ participant_id, choices_id, selected: [optionId...] }`. The user usually posts this from the UI, but you may post on your own behalf if needed.

- `POST /sessions/:id/events/todo` — body `{ participant_id, id, title, body?, status, assigned_to?, parent_id?, supersedes? }`.
  - `status` is one of `open`, `wip`, `done`, or `removed`.
  - `body` is the optional task description.
  - `assigned_to` is a participant id.
  - `parent_id` makes the todo a subtask. In the aligned tree, subtasks appear directly under their parent.
  - To update, complete, reassign, reparent, or remove a todo, POST a new todo event with the same `id` and `supersedes` set to that todo's latest event filename.
  - Removing a parent todo also removes its visible children.

- `POST /sessions/:id/events/flow` — body `{ participant_id, id, title?, nodes, edges, supersedes? }`. Use whenever you want to show the user a **diagram, flowchart, dependency graph, decision tree, or pipeline**. Prefer this over ASCII art or markdown lists for any non-trivial graph.

  - `id` — your own stable string (e.g. `fl_arch`). Re-use it with `supersedes` to revise.
  - `nodes` — array. Each: `{ id, label, title?, content?, popover?, itemType?, focused?, position? }`.
    - `itemType` ∈ `default | info | success | danger | disabled` — drives the node's color and weight.
    - `focused: true` — at most one. The renderer centers the viewport on it and adds a highlight ring.
    - `popover` — `{ html, css?, js? }`. Rendered inside a sandboxed iframe on click. Use for rich detail (tables, mini-charts, links).
    - `position` — `{ x, y }` in pixels. **Omit it if you want auto-layout.** If ANY node lacks a position, the whole graph is auto-laid-out (left-to-right). "All or nothing" — don't mix.
  - `edges` — array. Each: `{ id, source, target, label?, style?, type? }`.
    - `style` ∈ `solid | dashed | dotted | flowing`. `flowing` = animated marching dashes.
    - `type` ∈ `default | info | success | danger`. Drives the stroke color.

  Example:

  ```json
  {
    "participant_id": "ag-claude",
    "id": "fl_release",
    "title": "Release pipeline",
    "nodes": [
      { "id": "p1", "label": "Build",  "itemType": "default" },
      { "id": "p2", "label": "Test",   "itemType": "info"    },
      { "id": "p3", "label": "Deploy", "itemType": "success", "focused": true,
        "popover": { "html": "<p>Deploys to <b>prod</b> via GitHub Actions.</p>" } }
    ],
    "edges": [
      { "id": "e1", "source": "p1", "target": "p2", "style": "solid" },
      { "id": "e2", "source": "p2", "target": "p3", "style": "flowing", "type": "success" }
    ]
  }
  ```

- `POST /sessions/:id/events/turn-end` — body `{ participant_id }`. Marks your turn done.

## Reading state

- `GET /sessions/:id/events` returns `{ events: [{ filename, timestamp, kind, participant_id, payload }, ...] }`.
- `since=20260522T143012Z` filters strictly newer.
- `kinds=prose,choice` filters by kind.
- `participant=us-a7f3` filters by author.
- `GET /sessions/:id/todos` returns `{ open, wip, done, tree }`. Prefer this endpoint for task state: `tree` is already aligned for agent use, includes task descriptions, statuses, assignees, and renders each parent immediately followed by its subtasks.
- `GET /sessions/:id/todos?assigned_to=<participant_id>` filters the buckets and tree to one assignee.

## Authentication

If `--no-auth` was passed when the kernel started, you can skip the token. Otherwise: read `.f-mark/.token` and send `Authorization: Bearer <token>` on every request.

## Append-only

Never edit a file. To revise a contribution, POST a new prose event with the same `name` and `supersedes: <old_filename>`. The renderer's default view hides the superseded file; a history view shows everything.

## Best practices

- Read before you write. Always pull events since your last turn before contributing.
- Prefer named prose for durable contributions (plans, code, prose sections). Use unnamed messages for back-and-forth.
- Use comments (`target`) when commenting on a specific contribution — they render in context.
- Always end your turn with a `turn-end` event.

## Auto-stream hooks

The kernel exposes a CLI command (`npx -y f-mark hook auto-stream <participant_id>`) that, when wired into your runtime's "turn finished" hook, automatically POSTs:
- intermediate text blocks as `prose` with `arbitrary: true`
- tool calls as `tool-use` events
- the final text block as `prose` with `arbitrary: false`
- `turn-end` after the concluding prose

Runtime-specific install instructions live in each runtime's skill bundle (Claude Code: `.claude/skills/f-mark/`, Codex: `.codex/skills/f-mark/`, Gemini: `.gemini/skills/f-mark/`).

To stream output from a runtime that lacks lifecycle hooks, post mid-turn narration manually with `arbitrary: true` — the renderer treats both paths identically.

## Active session pointer

`POST /agents/<participant_id>/link` records the active session under `.f-mark/agents/<participant_id>/active-session`. The hook reads this file; without it, the hook exits silently with a stderr warning.

## Presence (v0.4+)

The kernel tracks per-participant presence via a `lastHookAt` timestamp. The shipped `f-mark hook auto-stream` command POSTs `POST /agents/<participant_id>/ping` automatically at the start of every fire. If you're implementing a custom integration that doesn't use the auto-stream hook, send this ping periodically (or at least at the start of every event POST) so your presence flips to `online` in the UI.

States: `launching`, `online`, `stale`, `offline`, `pane-dead`, `hook-not-installed`. The kernel broadcasts state changes over the WebSocket bus as `{ type: "presence", participant_id, state, last_hook_at }`.

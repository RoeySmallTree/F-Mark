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

- `POST /sessions/:id/events/choices` — body `{ participant_id, id, question, options: [{id, label, html?}], multi, supersedes? }`. Asks the user to pick. `id` is your own, e.g. `ch_approach`. `multi: false` = pick exactly one; `multi: true` = pick any number. If the question says "or more", "mix", "combine", or "select all", use `multi: true` or reword it as single-select. `options[].html` is an existing html-bundle filename to show as that option's preview — normally set for you by `/events/alternatives`, not hand-written.

- `POST /sessions/:id/events/alternatives` — body `{ participant_id, id, question, multi, options: [{id, label, html, css?, js?, title?, dependencies?}], supersedes?, append_to? }`. Generates one HTML bundle per option, then one visual multi-option widget rendering them as selectable previews with a fullscreen view. Use when presenting several HTML mockups to compare and choose between. `multi: false` = pick exactly one visual option; `multi: true` = pick any number.

- `POST /sessions/:id/events/choice` — body `{ participant_id, choices_id, selected: [optionId...] }`. The user usually posts this from the UI, but you may post on your own behalf if needed.

- `POST /sessions/:id/events/todo` — body `{ participant_id, id, title, body?, status, assigned_to?, parent_id?, supersedes? }`.
  - `status` is one of `open`, `wip`, `done`, or `removed`.
  - Use `wip` for the one task you are actively working on now. When you start real work on an assigned task, update it to `wip`; when you finish, update it to `done`.
  - `body` is the optional task description.
  - `assigned_to` is a participant id.
  - `parent_id` makes the todo a subtask. In the aligned tree, subtasks appear directly under their parent.
  - To update, complete, reassign, reparent, or remove a todo, POST a new todo event with the same `id` and `supersedes` set to that todo's latest event filename.
  - Removing a parent todo also removes its visible children.

- `POST /sessions/:id/events/flow` — body `{ participant_id, id, title?, nodes, edges, supersedes? }`. Use whenever you want to show the user a **diagram, flowchart, dependency graph, decision tree, pipeline, or state machine**. It renders as an interactive graph. **Never draw these as ASCII art, box-drawing, or a "diagram in a code block"** — use this event instead.

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

- `POST /sessions/:id/events/html` — body `{ participant_id, html, css?, js?, title?, dependencies?, supersedes?, append_to? }`. Renders a sandboxed HTML bundle. Use for **rendered UI, mockups, charts, or any rich visual** — never hand-draw a UI as ASCII/box-art. **The posting surface is not the design target — theme it to its destination, one of three visual targets:** (1) *target-repo-ui* — UI meant to ship in a specific repo or product (the current project or another) → read that target's own source styles/components/tokens first and match them (palette, components, typography, conventions), **not** F-Mark's applied theme; (2) *fmark-ui* — a mockup of F-Mark's own product UI (a new panel, a redesigned list, a settings screen) → read the real renderer source under `packages/renderer/src` first (start from `panels/sessions/SessionsPanelView.tsx`, `shell/shell.css`, `themes/tokens.css`, `themes/fonts.css`), reuse its class names and structural CSS, and resolve colors/font stacks via `GET /theme` (the design doc is a token reference, not a layout guide); (3) *session-artifact* — an unbound chart, analysis, or standalone visual native to this session → default to the Amber house theme: fetch `GET /theme?theme=amber` and build with its tokens instead of inventing colors.

- `file` events appear when the user uploads attachments. Their payload uses:
  `{ schema: "fmark.file.v1", id, display_name, path, mime_type, size_bytes, preview_kind }`.
  `path` is relative to `.f-mark/sessions/<session-id>/`; use that path on disk, or call `GET /sessions/:id/attachments/:file_id/content` to stream the bytes.
  To upload a file programmatically, `POST /sessions/:id/attachments` as `multipart/form-data` with fields `participant_id`, `file`, optional `display_name`, and optional `description`.
  To rename an attachment, `PATCH /sessions/:id/attachments/:file_id` with `{ participant_id, display_name }`.
  To comment on one, `POST /sessions/:id/attachments/:file_id/comments` with `{ participant_id, content }`.

- `POST /sessions/:id/events/turn-end` — body `{ participant_id }`. Marks your turn done.

## Session naming

Sessions are created with a placeholder name (`new-session`). Once you know what the session is about — usually after the first user message — rename it: `PATCH /sessions/:id` with `{ slug }` (short kebab-case, e.g. `fix-login-flow`); via MCP use `fmark_rename_session`. If no request has arrived yet, leave the placeholder; never invent a name. The session id is immutable — renaming only updates the display name, so every id you hold stays valid. Don't rename a session that already has a real (non-placeholder) name unless the user asks.

## Reading state

- `GET /sessions/:id/events` returns `{ events: [{ filename, timestamp, kind, participant_id, payload }, ...] }`.
- `since=20260522T143012Z` filters strictly newer.
- `kinds=prose,choice` filters by kind.
- `participant=us-a7f3` filters by author.
- `GET /sessions/:id/attachments` returns the latest visible uploaded files, including each event filename, `payload.path`, `disk_path`, `raw_url`, and `content_url`.
- `GET /sessions/:id/attachments/:file_id/content` streams the file bytes. Prefer `disk_path` when you need local filesystem tools.
- `GET /sessions/:id/todos` returns `{ open, wip, done, tree }`. Prefer this endpoint for task state: `tree` is already aligned for agent use, includes task descriptions in `body`, statuses, assignees, and renders each parent immediately followed by its subtasks. Siblings are grouped by status first (`wip`, `open`, `done`) and then by assignee.
- For a model-facing task check, use `GET /sessions/:id/todos?viewer=<your-participant-id>`. It still returns all visible todos, and every bucket/tree item includes `owned_by_viewer` plus `ownership: "owned"` or `"NOT owned"`.
- `GET /sessions/:id/todos?assigned_to=<participant_id>` filters the buckets and tree to one assignee. Use it only when you intentionally want to hide other assignees' todos.

## Authentication

If `--no-auth` was passed when the kernel started, you can skip the token. Otherwise: read `.f-mark/.token` and send `Authorization: Bearer <token>` on every request.

## Append-only

Never edit a file. To revise a contribution, POST a new prose event with the same `name` and `supersedes: <old_filename>`. The renderer's default view hides the superseded file; a history view shows everything.

## Best practices

- Read before you write. Always pull events since your last turn before contributing.
- **Two lanes.** The **document** is named, composed, and durable — put substantial structured work (plans, code, specs, designs, analyses) there, built from a named anchor plus `append_to` blocks. The **conversation** is messages and turns — use unnamed prose for back-and-forth. Choose deliberately. **One anchor per deliverable:** a new plan, answer, or artifact opens its **own** new named anchor — don't fold it into a document from an earlier turn just because that document is still on screen.
- **Never draw ASCII art.** Any visual or structural output must use a real surface, not characters arranged in prose: diagrams/flowcharts/pipelines/state machines → `flow` events; rendered UI, mockups, and rich visuals → `html` events (or `alternatives` for several to compare). No box-drawing, no "diagram in a code block". Markdown prose, tables, and lists are fine for ordinary text.
- **Theme before HTML — the posting surface is not the design target.** Before generating any `html` or `alternatives`, state which of three visual targets applies: *target-repo-ui* (UI for a specific repo/product — the current project or another → read *that* target's own styles first and match them, **not** F-Mark's applied theme), *fmark-ui* (UI that ships in F-Mark itself → read the real renderer source under `packages/renderer/src`, reuse its class names/structure, resolve colors/font stacks via `GET /theme`), or *session-artifact* (an unbound chart/analysis/standalone visual → default to the Amber house theme, `GET /theme?theme=amber`). An analysis or explainer diagram *about* F-Mark's UI is still a session-artifact; only a mockup that would ship in F-Mark is fmark-ui.
- **Asking the user to choose.** Several HTML designs to compare → `alternatives` (visual grid). Plain-text options → `choices` (`multi: false` = pick one, `multi: true` = pick any). Either way the pick is recorded with a `choice` event.
- Use comments (`target`) when commenting on a specific contribution — they render in context.
- **Reach for a real surface first.** Match the response's shape to a tool before writing prose: more than 3 sentences → a named document (a named anchor plus `append_to` blocks); visual options to compare → `alternatives`; text options → `choices`; any diagram/flow/tree/pipeline → `flow`; a mockup or chart → `html`; a file/line reference → a `file` event; multi-step work → `todo`; a slow tool call → `tool-use`. A nameless chat prose is for at most 3 short sentences of dialogue/status — promote anything longer to a named document.
- **Compose progressively; revise in place.** Post a header-only named anchor first, then stream sections as `append_to` blocks so the user watches a live-growing document and can comment mid-write. **`append_to` only extends the document you are *currently* building** — a new deliverable opens a new anchor; never append onto a prior, finished document or whatever anchor happened to be open from a previous turn. To update a block, re-post with `supersedes` and the same `append_to` — never post a "v2" as a new block.
- **End on the next decision.** Never close a turn on a passive statement of results. End with a `choices`/`alternatives` widget, a `todo` awaiting acceptance, or a one-line "over to you: X or Y?" — then the turn-end event.
- Always end your turn with a `turn-end` event.

## Auto-stream hooks

The kernel exposes a CLI command (`npx -y f-mark hook auto-stream <participant_id>`) that, when wired into your runtime's lifecycle hooks, automatically POSTs:
- runtime-supported live assistant text as `prose` with `arbitrary: true` (Claude `MessageDisplay`)
- live tool calls as `tool-use` events (`PostToolUse`)
- the final text block as `prose` with `arbitrary: false` (`Stop`)
- `turn-end` after the concluding prose

Runtime-specific install instructions live in each runtime's skill bundle (Claude Code: `.claude/skills/f-mark/`, Codex: `.codex/skills/f-mark/`, Opencode: `.opencode/skills/f-mark/`).

To stream output from a runtime that lacks lifecycle hooks, post mid-turn narration manually with `arbitrary: true` — the renderer treats both paths identically.

## Active session pointer

`POST /agents/<participant_id>/link` records the active session under `.f-mark/agents/<participant_id>/active-session`. The hook reads this file; without it, the hook exits silently with a stderr warning.

## Presence (v0.4+)

The kernel tracks per-participant presence via a `lastHookAt` timestamp. The shipped `f-mark hook auto-stream` command POSTs `POST /agents/<participant_id>/ping` automatically at the start of every fire. If you're implementing a custom integration that doesn't use the auto-stream hook, send this ping periodically (or at least at the start of every event POST) so your presence flips to `online` in the UI.

States: `launching`, `online`, `stale`, `offline`, `pane-dead`, `hook-not-installed`. The kernel broadcasts state changes over the WebSocket bus as `{ type: "presence", participant_id, state, last_hook_at }`.

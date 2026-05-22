# F-Mark Architecture

A document-based interface for AI agents to collaborate with humans, built on an append-only event log.

---

## 1. Core thesis

The unit of human-AI collaboration is not a message. It is a session. A session is a folder of timestamped, append-only event files that any participant (human or agent) contributes to. A renderer aggregates the log into a smart, interactive feed.

There is no central document. There is no chat. There is only a log of events on the filesystem, and a renderer that knows how to project them into something a human can read and act on.

**The filesystem is the protocol.**

---

## 2. Foundational principles

**Append-only.** No file is ever edited in place. Updates happen via supersession: a new file with a `supersedes` pointer to the file it replaces. The renderer's default view hides superseded files; a history view shows everything.

**Filesystem is canonical.** No database, no central state file. The entire session is the folder. Snapshots are `cp -r`, branches are folder copies, sharing is `zip`, version control is `git`.

**Minimal agent friction.** Agents interact through a small set of POST endpoints that all behave the same way: accept a structured payload, write a file, done. No PATCH, no PUT, no syntax to learn.

**JSON for structure, markdown for prose.** Structured content (comments, choices, todos, markers) lives in JSON files with versioned schemas. Free-form writing lives in markdown.

**The renderer is a projection.** It reads all files, groups by logical id, applies supersessions, and produces a chronological feed plus aggregated overlays. Multiple renderers can project the same log differently.

**Stateless reads.** GET endpoints have no side effects. Agents pass `since` parameters to query incremental state; the kernel does not track "what has been seen."

**Local-first with optional remote.** Runs on localhost by default. SSH and container scenarios are explicit flags. Cloud features are an optional layer, not a requirement.

**Every action has an author.** Every event records the participant id of who created it. This is the seed of multi-agent and multi-user collaboration.

---

## 3. Folder structure

```
user-project/
├── .gitignore                              ← appended to include .f-mark/.token
└── .f-mark/
    ├── config.json                         ← project config (port, defaults, participants)
    ├── AGENT.md                            ← bootstrap doc for agents
    ├── .token                              ← auth token (mode 0600, ephemeral)
    └── sessions/
        └── 2026-05-22-untitled/            ← session folder (YYYY-MM-DD-{slug})
            ├── 20260522T143012Z_us-a7f3.prose.md
            ├── 20260522T143245Z_ag-c92e.prose.md
            ├── 20260522T143301Z_us-a7f3.prose.md      ← comment (has file reference in frontmatter)
            ├── 20260522T143412Z_ag-c92e.prose.md      ← named prose (has name in frontmatter)
            ├── 20260522T143501Z_ag-c92e.choices.json
            ├── 20260522T143612Z_us-a7f3.choice.json
            ├── 20260522T143701Z_ag-c92e.html/
            │   ├── manifest.json
            │   ├── index.html
            │   ├── style.css
            │   └── script.js
            ├── 20260522T143801Z_ag-c92e.todo.json
            ├── 20260522T143901Z_ag-c92e.turn-end.json
            └── assets/
```

A session folder contains only event files (timestamped, named by convention) and an `assets/` directory. There is no `state.json`, no `document.md`, no manifest. The folder's contents are the entire state.

---

## 4. Participant identity

Every event records its author via a participant id embedded in the filename and in the event payload.

### Format

```
us-XXXX     → human user
ag-XXXX     → AI agent
```

`XXXX` is a short hex identifier (4-6 chars) unique within the project. Examples: `us-a7f3`, `ag-c92e`, `ag-claude`, `us-roey`.

### Why this format

- Visually distinguishable at a glance: `us-` vs `ag-` tells you human vs AI immediately
- Enables filtering and routing in multi-participant scenarios without parsing
- Extends naturally to roles like `sys-XXXX` (system events) or `grp-XXXX` (group/team) without breaking the model
- Short enough to embed in filenames without cluttering directory listings

### Participant registry

Participants are tracked in `.f-mark/config.json`:

```json
{
  "version": "0.1.0",
  "port": 7777,
  "participants": {
    "us-a7f3": { "kind": "user", "name": "Roey", "color": "#3b82f6" },
    "ag-c92e": { "kind": "agent", "name": "Claude Code", "color": "#f59e0b" }
  }
}
```

The first time the kernel starts, it generates a default user participant (`us-{random}`) for the current OS user.

Agents register themselves on first interaction via an API call (see §6.6). The kernel assigns them an `ag-XXXX` id if they don't bring one.

### Use today vs use later

For POC, the only practical distinction is "user vs agent" — used by the renderer to color-code and label events, and by hooks to route turn handoffs. The richer identity infrastructure (per-participant tasks, mentions, permissions) is enabled but not implemented in POC. The data model is ready when those features ship.

---

## 5. Filename convention

```
{ISO_TIMESTAMP}_{PARTICIPANT_ID}.{KIND}.{EXT}
```

- **`ISO_TIMESTAMP`**: `YYYYMMDDTHHMMSSZ` (UTC, filesystem-safe). Creation timestamp and sort key.
- **`PARTICIPANT_ID`**: e.g. `us-a7f3`, `ag-c92e`. The author.
- **`KIND`**: event type — `prose`, `choices`, `choice`, `todo`, `turn-end`, `html`, `file`.
- **`EXT`**: `.md` for prose, `.json` for structured data. HTML bundles are folders.

This is the public contract between agents and the kernel. Stable. Documented. The whole protocol fits on a postcard.

---

## 6. Event kinds (the protocol)

Every event is a file. Every event has a creation timestamp from its filename. Every event has a participant id. Every event may optionally include a `supersedes` field pointing to a prior filename.

### 6.1 `prose.md`

The unified text contribution kind. Covers both casual messages and durable named contributions, including comments that target other files. The differentiation is in the frontmatter, not the kind.

**Frontmatter fields (all optional):**

- `name`: a human-readable name for the prose. Presence of this field promotes the prose from an ephemeral message to a named, referenceable artifact. Future queries can list and filter by name.
- `target`: an object referencing another file (and optional line range). Presence of this field makes the prose a *comment* on that target. Comments render anchored to their target, not in the main feed.
- `in_reply_to`: filename of the prose this one replies to. Enables threading.
- `supersedes`: filename of a prior prose this one replaces.

**Resulting behavior matrix:**

| `name` | `target` | What it is | Where it renders |
|---|---|---|---|
| absent | absent | A message | Main feed, conversational lane |
| present | absent | A named contribution | Main feed, document lane |
| absent | present | A comment | Anchored to target, not in main feed |
| present | present | A named comment | Anchored to target + listed by name |

**Example: a message (no frontmatter at all)**
```md
Can you elaborate on approach B?
```

**Example: a named contribution**
```md
---
name: "Launch Plan v1"
---

# Launch Plan

Phase 1: ...
```

**Example: a comment on a specific file and lines**
```md
---
target:
  file: 20260522T143245Z_ag-c92e.prose.md
  lines: [3, 5]
---

This section needs to be more concrete.
```

**Example: a reply to an earlier message**
```md
---
in_reply_to: 20260522T143012Z_us-a7f3.prose.md
---

Sure. Approach B means rewriting the auth layer from scratch...
```

Frontmatter is parsed as YAML. Absent frontmatter is valid and treated as an unnamed, untargeted message.

### 6.2 `choices.json`

A selection widget. Usually posted by an agent asking the user.

```json
{
  "id": "ch_xyz789",
  "question": "Which approach should we take?",
  "options": [
    { "id": "a", "label": "Approach A: incremental" },
    { "id": "b", "label": "Approach B: rewrite" },
    { "id": "c", "label": "Approach C: defer" }
  ],
  "multi": false
}
```

### 6.3 `choice.json`

A participant's answer to a choices widget. Always a separate file so the question stays immutable.

```json
{
  "choices_id": "ch_xyz789",
  "selected": ["b"]
}
```

### 6.4 `todo.json`

A trackable task. Status changes via supersession. Tasks can be assigned to specific participants for multi-participant workflows.

```json
{
  "id": "td_def456",
  "title": "Draft the announcement email",
  "body": "Should mention the launch date and the GitHub link.",
  "status": "open",
  "assigned_to": "us-a7f3"
}
```

`assigned_to` is optional and is a participant id. If absent, the todo is unassigned. To close: new file with same `id`, `status: "done"`, `supersedes` pointing to the previous version.

### 6.5 `turn-end.json`

A marker that a participant has finished their turn. Hooks listen for these.

```json
{
  "participant_id": "us-a7f3"
}
```

The actor of the next turn is derived by inspecting recent turn-end events.

### 6.6 `html.{id}/` (folder)

An HTML simulation bundle. The agent POSTs a JSON payload; the kernel writes a folder containing:

```
20260522T143701Z_ag-c92e.html/
├── manifest.json     ← { id, title?, dependencies?: string[] }
├── index.html        ← imports style.css and script.js
├── style.css
└── script.js
```

The renderer mounts this folder in a sandboxed iframe.

### 6.7 `file.json` (generic asset reference)

For arbitrary file uploads/generations not covered by a specific kind.

```json
{
  "id": "file_ghi789",
  "path": "assets/diagram.png",
  "mime_type": "image/png",
  "description": "Architecture diagram"
}
```

The binary lives in `assets/`. This event references it.

### 6.8 Reserved kinds (future, same pattern)

`rank`, `slider`, `form`, `react`, `hook`, `branch`. Not in POC.

---

## 7. HTTP API

All endpoints (except `/health`) require `Authorization: Bearer <token>` from `.f-mark/.token`, unless the kernel was started with `--no-auth`.

### 7.1 Health and meta

- `GET /health` — `{ status, version }`. No auth required.

### 7.2 Participants

- `GET /participants` — list of participants from project config
- `POST /participants/register` — body `{ kind: "agent", name?: string, suggested_id?: string }` → registers an agent participant, returns assigned id. Used by agents on first interaction.

### 7.3 Sessions

- `GET /sessions` — list of session metadata
- `POST /sessions` — body `{ slug?: string }` → creates session, returns metadata

### 7.4 Events (the agent's primary surface)

All under `/sessions/:id/events/`. Every event body includes `participant_id` (the actor).

- `POST /events/prose` — body `{ participant_id, content, name?, target?, in_reply_to?, supersedes? }` → writes `*_prose.md` with frontmatter assembled from optional fields
- `POST /events/choices` — body matches choices schema + `participant_id`
- `POST /events/choice` — body matches choice schema + `participant_id`
- `POST /events/todo` — body matches todo schema + `participant_id`
- `POST /events/html` — body `{ participant_id, html, css, js, dependencies?, title?, supersedes? }` → writes html bundle folder
- `POST /events/turn-end` — body `{ participant_id }`
- `POST /events/file` — multipart upload + `participant_id` → writes to `assets/`, writes `*_file.json` reference

### 7.5 Reads

- `GET /sessions/:id/events?since=<ts>&kinds=<csv>&participant=<id>` — returns events, optionally filtered. Each event has `{ filename, timestamp, participant_id, kind, payload }`.
- `GET /sessions/:id/raw/:filename` — returns a raw file (assets, html bundle contents)
- `GET /sessions/:id/named?kind=prose` — convenience: returns all named prose for the session, for "list of contributions" views
- `GET /sessions/:id/todos?since=<ts>&assigned_to=<participant_id>` — open todos + new comments since timestamp, optionally filtered by assignee

### 7.6 Real-time

- `WS /ws?token=<x>` — WebSocket. Broadcasts on every event:
    - `{ type: "event_added", session_id, filename, kind, participant_id }`
    - `{ type: "event_superseded", session_id, filename, supersedes }`

---

## 8. Append-only and supersessions

Updates never modify a file in place. A new file is written with a `supersedes` field pointing to the previous filename.

The renderer's aggregation logic:
1. Read all events in chronological order
2. For each event with `supersedes`, mark the target as superseded
3. Default view: hide superseded events
4. History view: show all events

Logical identity (the thing preserved across supersessions) is the `id` field for events that have one (todos, choices, html bundles). For prose, supersession is pairwise — the new file replaces the old.

---

## 9. The renderer

### 9.1 Conceptual model

The renderer projects the event log into a UI. It reads all files, aggregates them, and renders:

- **The feed**: chronological cards. Each event kind has a card component.
- **Overlays**: aggregated views (open todos, comments grouped by target file, choices summary).
- **Navigation**: session list, jump between sessions.
- **Action surface**: bottom composer with named/unnamed toggle, end-turn button, preset actions.

### 9.2 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ TopBar:  [F-Mark]  Session: ▾   [● turn state]  [⚙]         │
├──────────┬───────────────────────────────────┬───────────────┤
│ LeftRail │           FEED                     │ RightPanel   │
│  (icons) │   ┌─────────────────────────────┐  │  (overlays)  │
│   📁     │   │ [agent named prose]         │  │              │
│   📋     │   ├─────────────────────────────┤  │  Open todos  │
│   💬     │   │ [user message]              │  │  Comments    │
│   ✓      │   ├─────────────────────────────┤  │  Named docs  │
│          │   │ [choices card]              │  │  Activity    │
│          │   ├─────────────────────────────┤  │              │
│          │   │ [agent message]             │  │              │
│          │   │   📌 1 comment              │  │              │
│          │   ├─────────────────────────────┤  │              │
│          │   │ [html embed]                │  │              │
│          │   └─────────────────────────────┘  │              │
├──────────┴───────────────────────────────────┴───────────────┤
│ BottomBar: [💬 Comment] [Compose…] [📝 Name it] [End turn] │
└──────────────────────────────────────────────────────────────┘
```

### 9.3 Visual distinction for prose

The renderer treats prose with and without `name` differently:

- **Named prose** (has `name` field): full card, prominent typography, listed in the "Named contributions" overlay, included in a "document view" filter.
- **Unnamed messages**: lighter visual treatment, conversational lane. Threaded by `in_reply_to`.
- **Comments** (has `target`): hidden from the main feed, rendered as pinned annotations on the target card. Listed in the comments overlay.

Each participant's events are color-coded by their assigned color from the participant registry. User events on one side, agent events on the other (or interleaved with avatars — design choice for the renderer).

### 9.4 Compose UI

The bottom composer has:
- A textarea for content
- A toggle: "Send as message" (default) vs "Save as named contribution"
- If "named" is toggled, a name input appears
- A "Comment on..." mode activated by highlighting text in a feed card → composes a prose with `target` populated
- A reply mode activated by clicking "reply" on a card → composes prose with `in_reply_to` populated

The toggle is the user-facing manifestation of the underlying mechanic: messages vs named contributions are not separate things, they're prose with or without a `name` field. The UI surfaces the distinction without inventing new concepts.

### 9.5 Aggregation logic

```ts
type AggregatedSession = {
  events: Event[];                                    // all, sorted by ts
  visible: Event[];                                   // not superseded
  feed: Event[];                                      // visible, not comments
  named: ProseEvent[];                                // visible prose with name
  comments_by_target: Map<filename, ProseEvent[]>;    // comments grouped
  todos: { open: Todo[], done: Todo[] };
  choices: ChoicesState[];                            // with answers projected
  current_turn_participant: string | null;            // derived from latest turn-end
};
```

Rebuilt from event list on every change (cheap for POC). Later optimization: incremental updates.

### 9.6 Update flow

1. Renderer subscribes to WebSocket on load
2. Kernel broadcasts `event_added` on file write (from API or external)
3. Renderer fetches and re-aggregates, re-renders affected cards

---

## 10. Turn model

There is no central turn state. Current turn is **derived from the latest `turn-end.json` event**:

- No turn-end events → user's turn (default)
- Latest turn-end's `participant_id` starts with `us-` → some agent's turn
- Latest turn-end's `participant_id` starts with `ag-` → user's turn

For multi-agent (post-POC), turn routing inspects the next-in-line agent registered in the session or specified by the last turn-end's metadata.

For POC: simple two-party alternation (user ↔ agent), but the data model already supports n-party.

---

## 11. Hooks (post-POC)

Scripts in `.f-mark/hooks/` invoked on event triggers. POC defers hooks; user manually invokes their agent.

Once hooks ship:

```
.f-mark/hooks/
├── on-turn-end-us-*.sh     ← any user ending turn
├── on-turn-end-ag-*.sh     ← any agent ending turn
├── on-comment.sh           ← any comment posted
├── on-mention-{id}.sh      ← when this participant is mentioned
└── on-choice.sh
```

Each hook receives the triggering event's filename and can do anything (invoke an agent, sync, notify).

---

## 12. The agent's experience

### Bootstrap (start of turn)

1. Agent invoked in session folder (terminal CWD or via skill instruction)
2. Agent reads `.f-mark/AGENT.md` to learn the protocol
3. If first time: agent calls `POST /participants/register` to get its `ag-XXXX` id (or asserts a known id)
4. Agent calls `GET /sessions/:id/events?since={last_seen_ts}` — returns everything new since last turn
5. Agent reads recent prose, comments, choices answered, todos changed

### Action

6. Agent posts events: prose (named or unnamed), choices, todos, html, comments (prose with target)
7. Each POST includes `participant_id` of the agent

### Conclusion

8. Agent posts `turn-end` with its participant id
9. Kernel broadcasts to renderer, user sees agent done
10. User reads, interacts, eventually posts their own `turn-end`

The agent's mental model: "I know my id. I read recent events. I post events. I post turn-end."

---

## 13. CLI flags

Implemented (phase 1.5):
- `--remote`, `--container`, `--port`, `--password`, `--no-auth`, `--help`

Planned:
- `--no-browser` — never auto-open
- `--host` — bind to non-localhost (requires explicit token)
- `--skill <id>` — preload a skill
- `--session <id>` — open directly to a session
- `--participant <id>` — override the default user participant id

---

## 14. Tech stack

**Kernel:** Node 20+, TypeScript strict, Fastify, chokidar, pnpm workspaces. No database; `fs/promises` only.

**Renderer:** React + TypeScript + Vite, Tailwind, zustand, react-markdown, native WebSocket.

**Distribution:** `f-mark` on npm. Kernel bundles built renderer as static files. `npx f-mark` entry point.

---

## 15. Security model

**Threat model:** other processes on the same machine gaining unauthorized access.

**Mitigations:**
- All endpoints (except `/health`) require bearer token
- Token generated per kernel start, mode 0600, deleted on shutdown
- Kernel binds `127.0.0.1` only by default
- HTML bundles render in sandboxed iframes
- All file ops validated against session root (no path traversal)
- Participant ids in payloads are validated against the registry — events can only be posted on behalf of a registered participant

**Out of scope for POC:**
- Network-exposed deployments
- E2E encryption for cloud sync
- Per-participant authorization (single-token grants full access)

---

## 16. POC vs later

### POC scope (phases 2-6, ~5 days)

- Session CRUD + participant registry (phase 2)
- Renderer scaffold + feed layout (phase 3)
- Prose events (named, unnamed, comments via `target`), choices, choice, turn-end (phase 4)
- Cards for each kind, composer with named/unnamed toggle (phase 4)
- Turn flow end-to-end (phase 5)
- AGENT.md + Claude Code skill (phase 6)

Demonstrable thesis: user prompts (unnamed message), agent reads, agent writes named contribution + choices, user clicks, user comments on the contribution, agent reads, agent revises via supersession.

### v0.1 (post-launch)

- Todos with assignment
- HTML bundles
- File uploads + asset rendering
- Skill installation
- Hooks
- Browser auto-open (local mode)
- WebSocket token auth

### v0.5 (paid tier)

- Cloud sync
- Shareable URLs
- Web-based read-only viewer
- Team workspaces (multiple human participants)
- Multi-agent orchestration
- Managed agent gateway

### v1.0 (vision)

- Branching, merging, snapshots
- Multi-document sessions
- React component output
- Skills marketplace
- Mobile renderer
- Plugin system

---

## 17. The compass

When a design question arises, test against these principles:

1. **Does it preserve append-only?** Edits must be supersessions or rethought.
2. **Does it reduce agent friction?** New API surface should be POST with structured body. No syntax to learn.
3. **Does it keep the filesystem canonical?** New state lives in event files, not side state.
4. **Does the renderer compose from the same primitives?** New UI projects from existing kinds; new kinds follow the existing pattern.
5. **Is it stateless on reads?** GETs never side-effect.
6. **Does it work without the cloud layer?** Local kernel stays fully functional.
7. **Is it explicit, not magic?** Flags over env detection. Predictable beats clever.
8. **Does the agent need to understand it?** Yes → document in AGENT.md. No → hide it.
9. **Is differentiation in the data, not the kind?** Variants of the same conceptual thing (messages vs named prose vs comments) share a kind and differ by optional fields.
10. **Does every event have a participant?** Every action attributable to a participant id — the foundation of multi-party collaboration.

These ten rules are the compass.

---

This is the locked architecture. Ready to rewrite the phase 2 prompt for the event-log model with participants when you are.
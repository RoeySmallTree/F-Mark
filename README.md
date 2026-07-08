# F-Mark

**A visionary workspace for building software *with* AI — where the conversation is a living document, not a disposable chat log.**

> The unit of human-AI collaboration is not a message. It is a session. And a session is not a stream that scrolls away — it is a folder of timestamped, append-only files that humans and agents author together, side by side.

We have a love/hate relationship with markdown. We love that it's plain text — diffable, greppable, version-controllable, readable by every model and every human without a schema. We hate that everything ends up flattened into it: a wall of chat where structure, decisions, and documents dissolve into an undifferentiated scroll that's gone the moment you close the tab.

F-Mark keeps the love and fixes the hate. A session is a folder on disk. Every contribution — a casual message, a named document, a todo, a decision point, an interactive diagram, a tool call — is its own timestamped file with a real shape. The kernel reads that folder and projects it into a live, visual chat where humans and agents write into the same log in real time. Nothing hides in a database. The state *is* the files, so your collaboration with AI is always inspectable, forkable, and yours.

**Model-agnostic by design.** Claude Code, Codex, Opencode — any agent, any provider — render into the same feed, indistinguishably. You're not locked to one lab's app.

**Viable on your subscription, not a metered API.** F-Mark drives the coding agents you already pay a flat monthly rate for, streaming their work into the session through their native hooks and plugins. No per-token meter running in the background — the interface sits on top of the tools you already have, so ambitious, long-running collaboration stays economical.

---

## Run it

F-Mark isn't published to npm yet, so you run it from source. You'll need **Node ≥ 20** and **pnpm** (the repo is a pnpm workspace).

```bash
pnpm install     # pnpm is required — npm won't link the workspace packages
npm run dev      # compiles the shared types, builds the renderer, starts the kernel
```

`npm run dev` prints a URL with an auth token embedded — open it in your browser; that's the interface. It watches and rebuilds the renderer and restarts the kernel as you edit, so leave it running. By default the kernel treats the repo root as the project; use `--path` (below) to point it elsewhere.

Point your coding agent at the same project (see [Agent integration](#agent-integration)) and its work streams into the session as it happens.

> Once F-Mark is published, `npx f-mark` will run it in any project directory with no build step.

### Flags

Pass kernel flags after `--` so npm forwards them to F-Mark instead of parsing them itself:

```bash
npm run dev -- --no-auth --port=9090
npm run dev -- --path=/abs/path/to/project

npm run dev:remote               # --remote
npm run dev:no-auth              # --no-auth
npm run dev:no-auth:process-api  # --no-auth --allow-process-api-no-auth
```

| Flag | Effect |
| --- | --- |
| `--port <n>` | HTTP port (default `7777`). Terminates any listener on the selected port before binding; fails if the port remains taken. |
| `--path <dir>` | Point the kernel at a specific project root instead of the current directory. |
| `--password <value>` | Use a specific token instead of generating one. |
| `--no-auth` | Disable the bearer token entirely. **Local development only.** |
| `--allow-process-api-no-auth` | Under `--no-auth`, also enable process-spawning routes (managed agents, terminals). **Use with caution** — anyone reachable on the port can spawn processes. |
| `--remote` | Print SSH port-forwarding instructions. |
| `--container` | Print Docker port-mapping instructions. |

`--no-auth` only disables the bearer token; it does **not** enable process-spawning routes by itself. Otherwise the token is stable across restarts: the kernel reuses an existing `.f-mark/.token` rather than minting a new one each boot, so long-lived agents stay authenticated through a restart.

### Tests

```bash
npm test              # kernel + renderer unit tests (vitest) + dev-arg parsing
npm run test:real-ui  # Playwright end-to-end against a real kernel + browser
```

Development notes and local planning artifacts are intentionally kept out of the release tree.

---

## How it works

There is no database. There is no proprietary format. There is a folder — and the folder *is* the state.

```
.f-mark/
├── config.json          # project config + participants
├── AGENT.md             # the protocol agents read to participate
├── .token               # bearer token (gitignored, mode 0600)
└── sessions/
    └── 2026-05-22-launch-plan/
        ├── 20260522T143012Z_us-a7f3.prose.md        # a human message
        ├── 20260522T143245Z_ag-claude.prose.md      # an agent's named document
        └── 20260522T143301Z_ag-claude.turn-end.json # "agent finished its turn"
```

Every event is a timestamped file named `<UTC-timestamp>_<participant-id>.<kind>.<ext>`. Events are **append-only**: you don't edit or delete them. To revise a contribution you append a new event that `supersedes` the old one, and the renderer hides the superseded version. The full history stays on disk.

Event kinds include `prose` (messages, named documents, comments, replies), `todo`, `choices`/`alternatives` (ask the human to pick), `flow` (interactive diagrams), `html` bundles, `tool-use`, and `turn-end`. The full protocol lives in `.f-mark/AGENT.md` once the kernel has run once.

Project-level state that isn't part of any session — the list of known project roots for the multi-project switcher — lives globally under `~/.config/f-mark/`.

---

## Architecture

F-Mark is a pnpm monorepo with three packages.

| Package | npm name | Role |
| --- | --- | --- |
| `packages/kernel` | **`f-mark`** | The CLI and server. Owns the event log and everything around it. |
| `packages/renderer` | `@f-mark/renderer` | The web UI — a React + Vite single-page app. Bundled into the kernel for distribution. |
| `packages/shared` | `@f-mark/shared` | TypeScript event contracts and participant/session/theme types shared by both. |

```
   ┌──────────────┐   hooks / plugin    ┌────────────────────────────────────────┐
   │   Agents     │ ──────────────────▶ │   Kernel  (f-mark · Fastify · Node ≥20) │
   │ Claude Code  │   MCP + HTTP API    │                                         │
   │ Codex        │ ◀─────────────────▶ │   • REST API: events, sessions, todos,  │
   │ Opencode     │                     │     files, git, search, presets…        │
   └──────────────┘                     │   • MCP server (stdio + HTTP)           │
                                        │   • WebSocket bus (live updates)        │
   ┌──────────────┐   REST + WebSocket  │   • tmux orchestration + xterm panes    │
   │   Browser    │ ◀─────────────────▶ │   • git diff / revert                   │
   │  (renderer)  │                     │   • serves the bundled renderer         │
   └──────────────┘                     └────────────────────┬───────────────────┘
                                                             │ reads / writes
                                                             ▼
                                              .f-mark/sessions/<id>/*.{md,json}
                                              (append-only event log = the state)
```

**The kernel** ([`packages/kernel`](packages/kernel)) is a [Fastify](https://fastify.dev) server (Node ≥ 20) that:

- Reads and writes the `.f-mark/` event log, validating every write with [Zod](https://zod.dev) against the shared contracts.
- Exposes a **REST API** for every event kind plus sessions, participants, todos, file browsing, git diff/revert, search, presets, and skills.
- Runs an **MCP server** (stdio + streamable HTTP) so agents can contribute structured events as tool calls (`fmark_post_prose`, `fmark_post_todo`, `fmark_post_flow`, …).
- Pushes live updates to the browser over a **WebSocket bus**, so the feed updates as files land — no polling.
- Orchestrates **managed agents and terminals** via tmux: it can spawn Claude Code, Codex, or Opencode into supervised tmux panes, attach an in-browser [xterm.js](https://xtermjs.org) terminal to any pane, and reconcile surviving panes after a restart.
- **Serves the renderer** as static files, so one process serves the whole UI. The production build (`npm run build`) bundles the SPA into the kernel for distribution.

**The renderer** ([`packages/renderer`](packages/renderer)) is a React 18 SPA (Vite, [Zustand](https://github.com/pmndrs/zustand) for state) that projects the event log into a grouped feed. It renders markdown and JSON in multiple modes, interactive flow diagrams ([React Flow](https://reactflow.dev)), a Monaco-backed file viewer, themes, a command palette (⌘K), and a comment overlay. The same feed renders identically regardless of which agent runtime produced the events.

**The shared package** ([`packages/shared`](packages/shared)) is the single source of truth for event shapes, participant/session types, and theme tokens. Kernel and renderer both consume its compiled output — `npm run dev` builds it for you via the renderer's `tsc -b` project reference.

---

## Agent integration

The trick that makes F-Mark viable — visual, structured collaboration on top of the flat-rate subscriptions you already have — lives here. F-Mark doesn't wrap a metered API; it plugs into the coding agents themselves, so an agent participates in two ways, and usually both at once:

1. **Auto-streaming.** Once a runtime hook (Claude Code, Codex) or the Opencode in-process plugin is installed, the agent's ongoing output — messages and tool calls — streams into the session automatically, with no extra work per turn. F-Mark detects whether the hook/plugin is installed and shows per-runtime install instructions when it isn't.
2. **Structured contributions.** For *named* output — documents, replies, comments, todos, choices, diagrams — the agent calls the MCP tools or the HTTP API directly. This is what turns a wall of chat into a structured session.

The kernel ships skill bundles and installers for each supported runtime under `packages/kernel/assets/` (`claude-skill/`, `codex-skill/`, `opencode-plugin/`, `opencode-skill/`). They walk an agent through registering a participant id, linking to a session, and adding the integration entry. The protocol an agent reads to participate is `.f-mark/AGENT.md`, written into every project on first run.

---

## The interface

This is where the vision becomes tangible. The renderer isn't a transcript viewer bolted onto a chatbot — it's a purpose-built surface for thinking alongside a model. Highlights:

- **Command palette (⌘K)** — fuzzy search across sessions, named contributions, todos, and quick actions; opens modals and switches themes.
- **Managed agents & terminals** — `+` in the top bar spawns an agent (or a plain shell) into a supervised tmux pane; click any chip to attach an in-browser terminal.
- **Presence** — top-bar chips show each agent's `online · stale · offline · hook-not-installed · pane-dead` state, derived from the auto-stream hook firing.
- **View toggle** — re-project the feed as *Everything / Document / Conversation*, persisted per session.
- **Comment overlay** — pin-click focuses a contribution, dims the rest, and opens its thread with reply + resolve.
- **Rich renderers** — multi-mode markdown (rendered / source / accordion) and JSON (tree / source / table), per-tool tool-use cards, interactive flow diagrams, and a file viewer.
- **Skills & presets palettes** — surface real skills from `.claude/skills/`, `.codex/skills/`, etc., and prompt templates, to insert into compose.
- **Themes** — multiple built-in themes (Default, Terminal, IDE, Solarized, Brutalist, Cyber, …), persisted in `localStorage`.

---

## License

MIT

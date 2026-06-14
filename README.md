# F-Mark

A document-based interface for AI agents to collaborate with humans, built on an append-only event log.

> The unit of human-AI collaboration is not a message. It is a session. A session is a folder of timestamped, append-only event files that any participant (human or agent) contributes to.

## Install

```bash
npx f-mark
```

Or as a dev dependency:

```bash
pnpm add -D f-mark
```

## Run

Inside any project directory:

```bash
npx f-mark
```

This starts the kernel on port 7777, generates a token, writes it to `.f-mark/.token`, and prints a URL with the token embedded. Open it.

### Flags

- `--port <n>` — HTTP port (default 7777). Increments on conflict.
- `--password <value>` — Use a specific token instead of generating one.
- `--no-auth` — Disable auth entirely (local development only).
- `--allow-process-api-no-auth` — Enable process-spawning routes under `--no-auth`. **Use with caution** — anyone reachable on the port can spawn processes.
- `--remote` — Print SSH port-forwarding instructions.
- `--container` — Print docker port-mapping instructions.

When running the monorepo dev script through npm, pass kernel flags after
`--` so npm forwards them to F-Mark. Without that separator, npm treats the
flags as npm config first: `npm run dev --remote` currently reaches F-Mark only
through npm's deprecated `npm_config_remote` environment fallback, and
`npm run dev --no-auth` fails earlier because npm parses `auth` as its own
registry-auth config.

```bash
npm run dev -- --remote
npm run dev -- --no-auth
npm run dev -- --no-auth --allow-process-api-no-auth
npm run dev -- --port=9090 --path=/abs/project
npm run dev:remote
npm run dev:no-auth
npm run dev:no-auth:process-api
```

`--no-auth` disables the bearer token. It does not enable process-spawning
routes by itself; add `--allow-process-api-no-auth` only for trusted local
development where any client that can reach the port may spawn processes.

## How it works

F-Mark stores everything in `.f-mark/`:

```
.f-mark/
├── config.json
├── AGENT.md
├── .token
└── sessions/
    └── 2026-05-22-launch-plan/
        ├── 20260522T143012Z_us-a7f3.prose.md
        ├── 20260522T143245Z_ag-claude.prose.md
        └── 20260522T143301Z_ag-claude.turn-end.json
```

Each event is a timestamped file. There is no database. The folder is the entire state.

## Agent integration

Point your agent at the local API. The protocol lives at `.f-mark/AGENT.md` once the kernel runs. For Claude Code, the kernel ships a skill bundle in `node_modules/f-mark/assets/claude-skill/f-mark/` that you can install into your `.claude/skills/` directory.

Agents stream output automatically once the runtime hook or plugin is installed. The skill bundle at `assets/<runtime>-skill/f-mark/SKILL.md` walks each runtime (Claude Code, Codex, Opencode) through registering, linking to a session via `POST /agents/:id/link`, and adding the integration entry. After install, the agent only calls the HTTP API for *structured* contributions (named documents, replies, comments, todos, choices).

Opencode streams through its in-process plugin; Claude Code and Codex use lifecycle hooks. The renderer renders the same grouped feed regardless of which supported runtime produced the events.

## Status

v0.2.0 — redesigned UI shipped. See `planning/redesign/` for the design source-of-truth and `planning/redesign/progress.md` for the phase log.

## What's new in v0.4

- **Managed agents** — Click `+` in the top bar to spawn Claude Code, Codex, or Opencode directly into a tmux session F-Mark supervises.
- **Terminal panes** — `+ → Terminal` opens a free-form shell pane in the project root.
- **Per-pane terminal overlay** — Click any agent or terminal chip → "Open terminal" to attach an in-browser xterm.js session to the tmux pane.
- **Presence** — Top-bar chips show `online | stale | offline | hook-not-installed | pane-dead` state, derived from the auto-stream hook firing.
- **Remote control** — Agent chip menus offer best-effort `/compact`, `interrupt`, and "Send a message" via tmux `send-keys`.
- **Hook/plugin install detection** — F-Mark detects whether the auto-stream hook or Opencode plugin is installed and shows manual install instructions per runtime.
- **Tmux orchestration** — Sessions survive kernel restarts. On reconnect, the kernel reconciles surviving tmux sessions with `.f-mark/agents/*/` pointers.

v0.4 is **additive** on v0.3.0's auto-stream backbone — existing hook installs keep working without changes.

## What's in the renderer

- **Command palette** (⌘K) — fuzzy search across sessions, named contributions, todos, and quick actions; opens new-session and settings modals; switches themes.
- **Presets popover** (⌘P / ⚡ button) — pre-fills compose with built-in or project-local prompt templates.
- **Skills palette** (⌘⇧K) — surfaces real skills scanned from `.claude/skills/`, `.codex/skills/`, `.opencode/skills/`, and `.skills/`; pick one to insert `/skill-name <args>` into compose.
- **Settings modal** (gear icon) — Profile, Connected Agents, Appearance (theme + density), Keyboard Shortcuts, About.
- **Six themes** — Default (light), Terminal, IDE, Solarized, Brutalist, Cyber. Persisted in localStorage; structural overrides per theme.
- **View toggle** (Everything / Document / Conversation) — re-projects the feed; per-session persistence.
- **Comment overlay** — pin-click focuses the contribution, dims the rest, opens the thread in the right panel with reply + resolve.
- **Real backend** — todos (with supersession), files, html bundles, raw asset serving, presets, skills, fuzzy search, participant PATCH.
- **Markdown + JSON renderers** — multi-mode: rendered / source / accordion for markdown; tree / source / table for JSON, with collapsible nesting.
- **Mid-turn group** — consecutive arbitrary prose + tool-use events from the same agent collapse into a single expandable card; auto-collapsed once the agent's concluding message arrives.
- **Tool-use cards** — tool invocations render with a per-tool icon and expandable input/output.

## Working on the redesign (for agentic workers)

If you're an LLM coding agent picking this work up after a context clear, **read `planning/redesign/INSTRUCTIONS.md` first** — it contains the verbatim original user instruction, the re-orient protocol, and pointers to the master plan and progress log. Do not start coding before reading it.

## License

MIT

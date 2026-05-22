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
- `--remote` — Print SSH port-forwarding instructions.
- `--container` — Print docker port-mapping instructions.

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

## Status

v0.2.0 — redesigned UI shipped. See `planning/redesign/` for the design source-of-truth and `planning/redesign/progress.md` for the phase log.

## What's in the renderer

- **Command palette** (⌘K) — fuzzy search across sessions, named contributions, todos, and quick actions; opens new-session and settings modals; switches themes.
- **Presets popover** (⌘P / ⚡ button) — pre-fills compose with built-in or project-local prompt templates.
- **Skills palette** (⌘⇧K) — surfaces real skills scanned from `.claude/skills/`, `.codex/skills/`, `.gemini/skills/`, and `.skills/`; pick one to insert `/skill-name <args>` into compose.
- **Settings modal** (gear icon) — Profile, Connected Agents, Appearance (theme + density), Keyboard Shortcuts, About.
- **Six themes** — Default (light), Terminal, IDE, Solarized, Brutalist, Cyber. Persisted in localStorage; structural overrides per theme.
- **View toggle** (Everything / Document / Conversation) — re-projects the feed; per-session persistence.
- **Comment overlay** — pin-click focuses the contribution, dims the rest, opens the thread in the right panel with reply + resolve.
- **Real backend** — todos (with supersession), files, html bundles, raw asset serving, presets, skills, fuzzy search, participant PATCH.
- **Markdown + JSON renderers** — multi-mode: rendered / source / accordion for markdown; tree / source / table for JSON, with collapsible nesting.

## Working on the redesign (for agentic workers)

If you're an LLM coding agent picking this work up after a context clear, **read `planning/redesign/INSTRUCTIONS.md` first** — it contains the verbatim original user instruction, the re-orient protocol, and pointers to the master plan and progress log. Do not start coding before reading it.

## License

MIT

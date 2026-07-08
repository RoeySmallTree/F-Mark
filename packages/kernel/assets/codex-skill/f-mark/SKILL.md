---
name: f-mark
description: Use whenever the user is collaborating inside an F-Mark session (presence of a `.f-mark/` directory in cwd, or the user references "the session" / "the document").
---

> **Status: Preview.** The auto-stream hook command parses transcripts using Claude Code's JSONL content-block schema. Codex's transcript uses a different, unstable internal schema, so the Stop-hook path described below may not produce correct events in production. Until a Codex-specific transcript parser ships, prefer explicit MCP/REST posts for prose, tool-use, and turn-end events. The Claude-Code-style auto-stream WILL work for Codex if its rollout JSONL happens to align block-by-block with Claude Code's, but assume that's not the case.

## Detect
If cwd contains `.f-mark/`, F-Mark is active. Read `.f-mark/AGENT.md` for the up-to-date protocol before doing anything else.

## Bootstrap
1. Read `.f-mark/AGENT.md` once per session.
2. Read `.f-mark/config.json` for the kernel port (default 7777).
3. Read `.f-mark/.token` for the bearer token.
4. Register your participant: `POST /participants/register`. Cache the returned `participant_id` (Codex agents conventionally use `ag-codex-<short>`).

## Managed spawn (v0.4+)

F-Mark v0.4 added the ability for the kernel to launch this agent for the user via a `+` button in the UI. When that happens:
- The kernel creates a detached tmux session running this agent CLI.
- It writes `.f-mark/agents/<your-id>/tmux-session` and `runtime` pointers automatically.
- The kernel applies and reconciles the managed runtime integration for the chosen scope during setup.
- Once hooks fire, presence flips online and your contributions stream automatically.

You don't need to handle the managed-vs-manual distinction in your code — both paths converge on the same auto-stream hook. The only side-effect for you: if you see `.f-mark/agents/<your-id>/tmux-session`, your process is being supervised by the kernel.

## Link into a session
1. `GET /sessions` and choose.
2. `POST /agents/<participant_id>/link` with `{ "session_id": "<chosen>" }`.
3. The user's participant id needs the same active-session pointer for the UserPromptSubmit hook to know where to log their prompts. After your own link succeeds, query `GET /participants?kind=user` to find the user(s). If there's exactly one, also `POST /agents/<user-id>/link` with the same `session_id`. If multiple users exist, ask via a `choices` event or pick the one matching `currentUserId` if exposed.

## Session naming
Sessions open with a placeholder name (`new-session`). Once you know what the session is about — usually after the first user message — rename it with the `fmark_rename_session` MCP tool (or `PATCH /sessions/:id` with `{ "slug": "..." }`) using a short kebab-case slug like `fix-login-flow`. If no request has arrived yet, leave the placeholder; never invent a name. The session id is immutable: renaming only changes the display slug, so keep using the same id. Don't rename sessions that already have a real name unless the user asks.

## Install the auto-stream hook (one-time per project)

Codex CLI supports lifecycle hooks identical in spirit to Claude Code's. Output streams automatically where Codex exposes a hook — you only call the API for *structured* contributions.

Install hooks for final assistant text, live tool calls, permission requests, and user prompts.

1. Check whether `.codex/config.toml` (project-level) or `~/.codex/config.toml` (user-level) already has F-Mark hook entries. The project-level config takes precedence and is preferred for F-Mark integration (scopes the hook to this project only).

2. Discover the user's participant id via `GET /participants?kind=user`. If none registered, skip the UserPromptSubmit hook for now and ask the user to register.

3. If hook entries are absent, add to `.codex/config.toml`:

```toml
[[hooks.Stop]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-yourname"]
timeout = 30

[[hooks.UserPromptSubmit]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "us-username", "--kind", "user"]
timeout = 10

[[hooks.PermissionRequest]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-yourname"]
timeout = 300

[[hooks.PostToolUse]]
command = ["npx", "-y", "f-mark", "hook", "auto-stream", "ag-codex-yourname"]
timeout = 30
```

Substitute `ag-codex-yourname` with your registered agent id and `us-username` with the user's.

4. On first invocation, Codex prompts the user to trust the hook command. Tell the user: "I've added the F-Mark auto-stream hook to `.codex/config.toml`. Codex will prompt you to trust the command on first run — approve once and it'll stick."

5. For headless / CI runs (`codex exec`), the user may need `--dangerously-bypass-hook-trust` or to pre-approve via `codex config approve-hooks`. Document this contingency to the user.

## What streams automatically
Once the hook is active, every assistant turn flows into the session as:
- live tool calls -> `tool-use` events
- final text -> prose with `arbitrary: false`, followed by `turn-end`
- user prompts -> prose as the user participant

Codex does not currently expose a `MessageDisplay`-style assistant text hook, so mid-run assistant narration still needs an explicit MCP/REST post if it must appear before Stop.

You do NOT POST these manually.

## What you still POST manually
- **Named contributions** (documents, plans): `POST /events/prose` with `name` set.
- **Comments anchored to lines**: `POST /events/prose` with `target: { file, lines }`.
- **Replies**: `POST /events/prose` with `in_reply_to`.
- **Revisions**: `POST /events/prose` with `supersedes`.
- **Todos / choices / alternatives / file / html / flow**: their dedicated endpoints.

**Never draw ASCII art.** Any visual or structural output must use a real surface, not characters arranged in prose. No box-drawing, no "diagram in a code block", no hand-aligned trees of pipes and dashes. Markdown prose, tables, and lists are fine for ordinary text.

**Flow charts / diagrams.** When the user asks for a diagram, flowchart, pipeline, decision tree, dependency graph, or state machine — or whenever you'd otherwise reach for ASCII art — POST `/sessions/<id>/events/flow` with `{ id, nodes, edges }`. It renders as an interactive graph. See `api.md` for the full schema. Nodes support `itemType` (info/success/danger/disabled), `focused: true` for emphasis, and `popover: { html, css?, js? }` for click-to-reveal detail. Edges support `style: flowing` for animated dashes. Omit `position` to get auto-layout.

**Rendered UI / rich visuals.** For a rendered UI, mockup, chart, or any rich visual, POST `/sessions/<id>/events/html` with `{ html, css?, js?, title? }` — a sandboxed bundle, never ASCII. **The posting surface is not the design target — theme the output to its destination, one of three visual targets:** target-repo-ui (UI for a specific repo or product — the current project or another) → match *that* target's own design system, reading its source first, not F-Mark's applied theme; fmark-ui (UI that ships in F-Mark itself) → read the real renderer source under `packages/renderer/src` and reuse its class names/structure, resolving colors via `GET /theme`; session-artifact (an unbound chart, analysis, preview) → default to the Amber house theme (`GET /theme?theme=amber`) and build with its tokens instead of inventing colors. To present several designs to compare and pick from, POST `/sessions/<id>/events/alternatives` (the same destination rule applies).

**Documents vs conversation.** Two surfaces. The **document** is named, composed, and durable — put substantial structured work (plans, specs, designs, analyses) there, built from a named anchor plus `append_to` blocks (prose, flow, html, file, todo, choices, tool-use). The **conversation** is messages and turns — use unnamed prose for back-and-forth. Choose deliberately. **One anchor per deliverable:** a new plan, answer, or artifact opens its **own** new named anchor — `append_to` only extends the document you are *currently* building, never a document from an earlier turn just because it is still on screen.

When you POST manually, do NOT set `arbitrary: true` — manual posts are by definition deliberate.

## Revising
POST new prose with `supersedes: <old_filename>`.

## Don't
- Don't disable the hook to "save tokens" — that's its job.
- Don't write directly into `.f-mark/sessions/...`. Always go through the API.
- Don't fabricate participant_ids.

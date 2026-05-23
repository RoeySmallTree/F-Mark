---
name: f-mark
description: Use whenever the user is collaborating inside an F-Mark session (presence of a `.f-mark/` directory in cwd, or the user references "the session" / "the document").
---

> **Status: Preview.** The auto-stream hook command parses transcripts using Claude Code's JSONL content-block schema. Codex's transcript uses a different, unstable internal schema, so the Stop-hook path described below may not produce correct events in production. Until a Codex-specific transcript parser ships, prefer the manual-POST flow described in the Gemini skill (`packages/kernel/assets/gemini-skill/f-mark/SKILL.md`) — the model emits prose / tool-use / turn-end events itself. The Claude-Code-style auto-stream WILL work for Codex if its rollout JSONL happens to align block-by-block with Claude Code's, but assume that's not the case.

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
- The user pastes the auto-stream hook snippet for this agent's id into their runtime config (the kernel renders the snippet via `GET /managed-agents/hook-install-instructions`).
- Once hooks fire, presence flips online and your contributions stream automatically.

You don't need to handle the managed-vs-manual distinction in your code — both paths converge on the same auto-stream hook. The only side-effect for you: if you see `.f-mark/agents/<your-id>/tmux-session`, your process is being supervised by the kernel.

## Link into a session
1. `GET /sessions` and choose.
2. `POST /agents/<participant_id>/link` with `{ "session_id": "<chosen>" }`.
3. The user's participant id needs the same active-session pointer for the UserPromptSubmit hook to know where to log their prompts. After your own link succeeds, query `GET /participants?kind=user` to find the user(s). If there's exactly one, also `POST /agents/<user-id>/link` with the same `session_id`. If multiple users exist, ask via a `choices` event or pick the one matching `currentUserId` if exposed.

## Install the auto-stream hook (one-time per project)

Codex CLI supports lifecycle hooks identical in spirit to Claude Code's. Output streams automatically — you only call the API for *structured* contributions.

Two hooks to install: one for the assistant's turn (your id), one for user prompts (the user's id).

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
```

Substitute `ag-codex-yourname` with your registered agent id and `us-username` with the user's.

4. On first invocation, Codex prompts the user to trust the hook command. Tell the user: "I've added the F-Mark auto-stream hook to `.codex/config.toml`. Codex will prompt you to trust the command on first run — approve once and it'll stick."

5. For headless / CI runs (`codex exec`), the user may need `--dangerously-bypass-hook-trust` or to pre-approve via `codex config approve-hooks`. Document this contingency to the user.

## What streams automatically
Once the hook is active, every assistant turn flows into the session as:
- mid-turn text → prose with `arbitrary: true`
- tool calls → `tool-use` events
- final text → prose with `arbitrary: false`, followed by `turn-end`

You do NOT POST these manually.

## What you still POST manually
- **Named contributions** (documents, plans): `POST /events/prose` with `name` set.
- **Comments anchored to lines**: `POST /events/prose` with `target: { file, lines }`.
- **Replies**: `POST /events/prose` with `in_reply_to`.
- **Revisions**: `POST /events/prose` with `supersedes`.
- **Todos / choices / file / html**: their dedicated endpoints.

When you POST manually, do NOT set `arbitrary: true` — manual posts are by definition deliberate.

## Revising
POST new prose with `supersedes: <old_filename>`.

## Don't
- Don't disable the hook to "save tokens" — that's its job.
- Don't write directly into `.f-mark/sessions/...`. Always go through the API.
- Don't fabricate participant_ids.

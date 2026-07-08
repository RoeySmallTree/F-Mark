---
name: f-mark
description: Use whenever the user is collaborating inside an F-Mark session (presence of a `.f-mark/` directory in cwd, or the user references "the session" / "the document").
---

## Detect
If cwd contains `.f-mark/`, F-Mark is active. Read `.f-mark/AGENT.md` for the up-to-date protocol before doing anything else.

## Bootstrap
1. Read `.f-mark/AGENT.md` once per session.
2. Read `.f-mark/config.json` for the kernel port (default 7777).
3. Read `.f-mark/.token` for the bearer token.
4. Register your participant: `POST /participants/register`. Cache the returned `participant_id`.

## Managed spawn (v0.4+)

F-Mark v0.4 added the ability for the kernel to launch this agent for the user via a `+` button in the UI. When that happens:
- The kernel creates a detached tmux session running this agent CLI.
- It writes `.f-mark/agents/<your-id>/tmux-session` and `runtime` pointers automatically.
- The kernel applies and reconciles the managed runtime integration for the chosen scope during setup.
- Once hooks fire, presence flips online and your contributions stream automatically.

You don't need to handle the managed-vs-manual distinction in your code — both paths converge on the same auto-stream hook. The only side-effect for you: if you see `.f-mark/agents/<your-id>/tmux-session`, your process is being supervised by the kernel.

## Link into a session
Before producing any output worth logging, pick a session and link to it:

1. `GET /sessions` and choose (newest, named-by-user, or ask via a `choices` event).
2. `POST /agents/<participant_id>/link` with `{ "session_id": "<chosen>" }`.
3. The user's participant id needs the same active-session pointer for the UserPromptSubmit hook to know where to log their prompts. After your own link succeeds, query `GET /participants?kind=user` to find the user(s). If there's exactly one, also `POST /agents/<user-id>/link` with the same `session_id`. If multiple users exist, ask via a `choices` event or pick the one matching `currentUserId` if exposed.

After linking, the kernel knows where your stream goes.

## Session naming
Sessions open with a placeholder name (`new-session`). Once you know what the session is about — usually after the first user message — rename it with the `fmark_rename_session` MCP tool (or `PATCH /sessions/:id` with `{ "slug": "..." }`) using a short kebab-case slug like `fix-login-flow`. If no request has arrived yet, leave the placeholder; never invent a name. The session id is immutable: renaming only changes the display slug, so keep using the same id. Don't rename sessions that already have a real name unless the user asks.

## Install the auto-stream hook (one-time per project)
Your output is streamed automatically by hooks; you only call the API for *structured* contributions. Install the F-Mark auto-stream command on the Claude hooks below.

1. Read `.claude/settings.json` (create if missing).
2. Verify it contains:
   - `hooks.MessageDisplay`: captures live assistant text as mid-turn prose.
   - `hooks.PostToolUse`: captures tool calls live during the turn.
   - `hooks.PermissionRequest`: forwards permission prompts into F-Mark.
   - `hooks.Stop`: captures the final assistant message and closes the turn.

3. If absent, add the missing entries. Minimal config:

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream",
      "timeout": 30 }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream",
      "timeout": 300 }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream" }] }],
    "MessageDisplay": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream",
      "timeout": 10 }] }]
  }
}
```

4. Tell the user: "I've added the F-Mark auto-stream hooks for Claude. Restart Claude Code (or run `/exit` and re-launch) so they activate — output will start streaming on the next session."

## What streams automatically
Once the hook is active, every assistant turn flows into the session as:
- live assistant text -> prose with `arbitrary: true`
- tool calls -> `tool-use` events
- final text -> prose with `arbitrary: false`, followed by `turn-end`

You do NOT POST these manually.

## What you still POST manually
- **Named contributions** (documents, plans): `POST /events/prose` with `name` set to open a header-only anchor, then `append_to` blocks onto it. Open a **new** anchor for each new deliverable — `append_to` only extends the document you are currently building, never a prior one or whatever anchor was last open.
- **Comments anchored to lines**: `POST /events/prose` with `target: { file, lines }`.
- **Replies**: `POST /events/prose` with `in_reply_to`.
- **Revisions**: `POST /events/prose` with `supersedes`.
- **Todos / choices / alternatives / file / html**: their dedicated endpoints.

When you POST manually, do NOT set `arbitrary: true` — manual posts are by definition deliberate.

## Revising
POST new prose with `supersedes: <old_filename>`. Works for both auto-streamed and manual posts.

## Flow charts / diagrams

When the user asks for a diagram, flowchart, pipeline, or decision tree — or whenever you'd otherwise reach for ASCII art — POST `/sessions/<id>/events/flow` with `{ id, nodes, edges }`. See `api.md` for the full schema. Nodes support `itemType` (info/success/danger/disabled), `focused: true` for emphasis, and `popover: { html, css?, js? }` for click-to-reveal detail. Edges support `style: flowing` for animated dashes.

## Don't
- Don't disable the hook to "save tokens" — that's its job.
- Don't write directly into `.f-mark/sessions/...`. Always go through the API.
- Don't fabricate participant_ids.

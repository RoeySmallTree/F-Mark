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
- The user pastes the auto-stream hook snippet for this agent's id into their runtime config (the kernel renders the snippet via `GET /managed-agents/hook-install-instructions`).
- Once hooks fire, presence flips online and your contributions stream automatically.

You don't need to handle the managed-vs-manual distinction in your code — both paths converge on the same auto-stream hook. The only side-effect for you: if you see `.f-mark/agents/<your-id>/tmux-session`, your process is being supervised by the kernel.

## Link into a session
Before producing any output worth logging, pick a session and link to it:

1. `GET /sessions` and choose (newest, named-by-user, or ask via a `choices` event).
2. `POST /agents/<participant_id>/link` with `{ "session_id": "<chosen>" }`.
3. The user's participant id needs the same active-session pointer for the UserPromptSubmit hook to know where to log their prompts. After your own link succeeds, query `GET /participants?kind=user` to find the user(s). If there's exactly one, also `POST /agents/<user-id>/link` with the same `session_id`. If multiple users exist, ask via a `choices` event or pick the one matching `currentUserId` if exposed.

After linking, the kernel knows where your stream goes.

## Install the auto-stream hook (one-time per project)
Your output is streamed automatically by hooks; you only call the API for *structured* contributions. There are TWO hooks to install — one captures the assistant's turn (you), the other captures user prompts.

1. Read `.claude/settings.json` (create if missing).
2. Verify it contains:
   - `hooks.Stop`: invokes `npx -y f-mark hook auto-stream <your-agent-participant-id>` — this captures YOUR turn (post as the agent).
   - `hooks.UserPromptSubmit`: invokes the same command with `--kind user`, scoped to the USER's participant id — this captures the user's prompts (post as the user).
3. The user's participant id may not exist yet at install time. Use `GET /participants?kind=user` to find it — if there's exactly one user participant, use that id. If there are zero, skip the UserPromptSubmit hook and ask the user to register first.

   The agent's own id is whatever you cached during Bootstrap.

4. If absent, add the missing entries. Minimal config (substitute IDs):

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream ag-yourname",
      "timeout": 30 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream us-username --kind user",
      "timeout": 10 }] }]
  }
}
```

5. Tell the user: "I've added the F-Mark auto-stream hook with my id `ag-…` for Stop and the user id `us-…` for UserPromptSubmit. Restart Claude Code (or run `/exit` and re-launch) so it activates — output will start streaming on the next session."

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
POST new prose with `supersedes: <old_filename>`. Works for both auto-streamed and manual posts.

## Don't
- Don't disable the hook to "save tokens" — that's its job.
- Don't write directly into `.f-mark/sessions/...`. Always go through the API.
- Don't fabricate participant_ids.

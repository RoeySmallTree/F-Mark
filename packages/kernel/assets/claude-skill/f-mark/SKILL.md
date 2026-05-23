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

## Link into a session
Before producing any output worth logging, pick a session and link to it:

1. `GET /sessions` and choose (newest, named-by-user, or ask via a `choices` event).
2. `POST /agents/<participant_id>/link` with `{ "session_id": "<chosen>" }`.

After linking, the kernel knows where your stream goes.

## Install the auto-stream hook (one-time per project)
Your output is streamed automatically by hooks; you only call the API for *structured* contributions. To enable streaming:

1. Read `.claude/settings.json` (create if missing).
2. Verify it contains an entry under `hooks.Stop` and `hooks.UserPromptSubmit` invoking `npx -y f-mark hook auto-stream <participant_id>` (Stop) and the same command with `--kind user` (UserPromptSubmit). Both hook configs MUST scope the participant_id to *your* registered id, not a placeholder.
3. If absent, add them. Minimal config:

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream <participant_id>",
      "timeout": 30 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command",
      "command": "npx -y f-mark hook auto-stream <us-participant-id> --kind user",
      "timeout": 10 }] }]
  }
}
```

4. Tell the user: "I've added the F-Mark auto-stream hook. Restart Claude Code (or run `/exit` and re-launch) so it activates — output will start streaming on the next session."

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

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
4. Register your participant: `POST /participants/register`. Cache the returned `participant_id` (Gemini agents conventionally use `ag-gemini-<short>`).

## Managed spawn (v0.4+)

F-Mark v0.4 added the ability for the kernel to launch this agent for the user via a `+` button in the UI. When that happens:
- The kernel creates a detached tmux session running this agent CLI.
- It writes `.f-mark/agents/<your-id>/tmux-session` and `runtime` pointers automatically.
- The user pastes the auto-stream hook snippet for this agent's id into their runtime config (the kernel renders the snippet via `GET /managed-agents/hook-install-instructions`).
- Once hooks fire, presence flips online and your contributions stream automatically.

You don't need to handle the managed-vs-manual distinction in your code — both paths converge on the same auto-stream hook. The only side-effect for you: if you see `.f-mark/agents/<your-id>/tmux-session`, your process is being supervised by the kernel.

> **v0.4 note:** Gemini still uses manual-stream mode — no hooks are installed for Gemini in v0.4. Managed spawn still works (the kernel launches the Gemini CLI in a tmux session), but contributions must be POSTed manually as described in the **Streaming (manual mode)** section below.

## Link into a session
1. `GET /sessions` and choose (newest, named-by-user, or ask via a `choices` event).
2. `POST /agents/<participant_id>/link` with `{ "session_id": "<chosen>" }`.
3. The user's participant id needs the same active-session pointer for the UserPromptSubmit hook to know where to log their prompts. After your own link succeeds, query `GET /participants?kind=user` to find the user(s). If there's exactly one, also `POST /agents/<user-id>/link` with the same `session_id`. If multiple users exist, ask via a `choices` event or pick the one matching `currentUserId` if exposed.

After linking, the kernel knows where your stream goes.

## Streaming (manual mode)

Gemini CLI ships with lifecycle hooks (`AfterAgent`, `BeforeAgent`, `AfterTool`, `BeforeTool`), but its `transcript_path` JSONL uses a Gemini-specific schema (`type: "user" | "gemini"`, sibling `toolCalls: ToolCallRecord[]` arrays, `PartListUnion` content) that F-Mark's auto-stream pipeline can't parse today. Until F-Mark adds a Gemini-flavored transcript parser, **the model is responsible for streaming its own turn into the session.**

The renderer projection is identical to the hook-driven runtimes (Claude Code, Codex) — only the producer differs. The contract is:

### For each tool-using response

1. **Before invoking a tool**, POST the narration text (what you're about to do and why) as prose with `arbitrary: true`:
   ```http
   POST /sessions/<id>/events/prose
   { "participant_id": "ag-gemini-yourname",
     "content": "I'll search the repo for the failing test.",
     "arbitrary": true }
   ```
2. **Invoke the tool.** When it returns, POST a `tool-use` event capturing the tool name, input, output, and success:
   ```http
   POST /sessions/<id>/events/tool-use
   { "participant_id": "ag-gemini-yourname",
     "tool_name": "Bash",
     "tool_use_id": "tu_<short>",
     "input": { "command": "rg -n 'TODO' src/" },
     "result": "src/foo.ts:42:// TODO: ...",
     "success": true,
     "duration_ms": 87 }
   ```
3. Repeat steps 1–2 for each subsequent tool call.
4. **When you've decided your final answer**, POST it as prose with `arbitrary: false` (omitting the field also defaults to false):
   ```http
   POST /sessions/<id>/events/prose
   { "participant_id": "ag-gemini-yourname",
     "content": "Found 3 stale TODOs in src/foo.ts. Suggest closing them." }
   ```
5. **Close the turn:**
   ```http
   POST /sessions/<id>/events/turn-end
   { "participant_id": "ag-gemini-yourname" }
   ```

### For tool-free responses

POST a single prose with `arbitrary: false`, then `turn-end`:
```http
POST /sessions/<id>/events/prose
{ "participant_id": "ag-gemini-yourname",
  "content": "The fix is to swap the order of the two assertions." }

POST /sessions/<id>/events/turn-end
{ "participant_id": "ag-gemini-yourname" }
```

This produces a feed identical to the hook-driven runtimes — the renderer doesn't care which path was used. Mid-turn arbitrary prose + tool-use events get grouped into a collapsible "mid-turn" box that auto-closes when the concluding prose arrives.

## What you still POST manually (in addition to the streaming above)

These are deliberate, *named* contributions distinct from the auto-stream flow:

- **Named contributions** (documents, plans): `POST /events/prose` with `name` set and `arbitrary: false`.
- **Comments anchored to lines**: `POST /events/prose` with `target: { file, lines }` and `arbitrary: false`.
- **Replies**: `POST /events/prose` with `in_reply_to` and `arbitrary: false`.
- **Revisions**: `POST /events/prose` with `supersedes` and `arbitrary: false`.
- **Todos / choices / file / html**: their dedicated endpoints.

These never carry `arbitrary: true` — by definition they're deliberate posts, not mid-turn narration.

## Revising

POST new prose with `supersedes: <old_filename>`. Works for both auto-streamed and manual posts.

## Why no `AfterAgent` hook today?

A native Gemini hook would only get `prompt_response` (the flat final-text string) and a `transcript_path` whose JSONL Gemini uses a non-Claude-Code-compatible schema. Until F-Mark adds a Gemini-flavored transcript parser, the model itself is the cleanest producer of the structured event stream. See `docs/superpowers/plans/2026-05-23-gemini-hooks-research.md` for the rationale.

## Don't

- Don't write directly into `.f-mark/sessions/...`. Always go through the API.
- Don't fabricate participant_ids — always register first and cache the returned id.
- Don't set `arbitrary: true` on named / targeted / reply / superseding posts — those are deliberate by definition.
- Don't forget the `turn-end` — without it the renderer can't tell when your turn has concluded, and the next agent / user contribution will look concatenated.

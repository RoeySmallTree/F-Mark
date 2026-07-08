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
4. Register your participant: `POST /participants/register`. Cache the returned `participant_id` (Opencode agents conventionally use `ag-opencode-<short>`).

## Managed spawn (v0.4+)

F-Mark can launch this agent for the user via the `+` button in the UI. When that happens:
- The kernel creates a detached tmux session running `opencode`.
- It writes `.f-mark/agents/<your-id>/tmux-session` and `runtime` pointers automatically.
- The kernel installs an in-process plugin at `.opencode/plugin/fmark.ts` (project scope) or `~/.config/opencode/plugin/fmark.ts` (user scope). The plugin subscribes to opencode's hooks and POSTs your assistant text, tool use, and turn boundaries straight to the kernel — no manual streaming needed.
- Once the plugin loads, presence flips online and your contributions stream automatically.

If you see `.f-mark/agents/<your-id>/tmux-session`, your process is being supervised by the kernel.

## How streaming works (plugin mode)

Opencode streams automatically through the installed plugin:
- **Assistant text** is captured from opencode's `event` hook (`message.part.updated` / `message.updated`) and posted as prose.
- **Tool use** is captured from `tool.execute.after` and posted as tool-use events.
- **Turn end** is emitted on `session.idle`, gated on having posted content that turn.
- **Permissions** flow through opencode's `permission.ask`; the plugin surfaces an access card and waits for the user's response.

You generally do not POST events yourself when running managed — the plugin owns the stream. Use the MCP tools (preferred) for reads (`fmark_get_inbox`, `fmark_read_events`) and for any explicit prose you want to author.

## Link into a session
1. `GET /sessions` and choose (newest, named-by-user, or ask via a `choices` event).
2. `POST /agents/<participant_id>/link` with `{ "session_id": "<chosen>" }`.
3. The user's participant id needs the same active-session pointer. After your own link succeeds, query `GET /participants?kind=user`; if there's exactly one user, also `POST /agents/<user-id>/link` with the same `session_id`.

After linking, the kernel knows where your stream goes.

## Session naming
Sessions open with a placeholder name (`new-session`). Once you know what the session is about — usually after the first user message — rename it with the `fmark_rename_session` MCP tool (or `PATCH /sessions/:id` with `{ "slug": "..." }`) using a short kebab-case slug like `fix-login-flow`. If no request has arrived yet, leave the placeholder; never invent a name. The session id is immutable: renaming only changes the display slug, so keep using the same id. Don't rename sessions that already have a real name unless the user asks.

## First action
Don't open with a filler greeting like "Connected." — the managed spawn already shows you online. If the session still has its placeholder name (`new-session`), rename it first (`fmark_rename_session`). Then answer the user's active request directly; if there are unread comments (`mode: "comment"`), address those first. End the turn with `fmark_end_turn`.

## Rendered UI / rich visuals
For a rendered UI, mockup, chart, or any rich visual, use `fmark_post_html` (or `fmark_post_alternatives` for several to compare) — never ASCII. The posting surface is not the design target: first classify the visual target as one of three — **target-repo-ui** (UI for a specific repo or product — the current project or another → match *that* target's own design system, reading its source first, not F-Mark's applied theme), **fmark-ui** (UI that ships in F-Mark itself → read the real renderer source under `packages/renderer/src` and reuse its class names/structure, resolving colors via `fmark_get_theme`), or **session-artifact** (an unbound chart/analysis/standalone visual → default to the Amber house theme, `fmark_get_theme` with `theme: "amber"`).

## Reference
See `api.md` in this folder for the full REST/MCP protocol reference.

---
name: f-mark
description: Use whenever the user is collaborating with you inside an F-Mark session. Detect by the presence of a .f-mark/ directory in the project. Lets you read the event log and post prose, choices, comments, and turn-end events.
---

# F-Mark collaboration

You are participating in an F-Mark session. The user runs the kernel in their project; you contribute via the local HTTP API.

## Detect

If the current working directory contains a `.f-mark/` directory, F-Mark is active. The full protocol reference is at `.f-mark/AGENT.md` in that project — read it first.

## Bootstrap

1. Read `.f-mark/AGENT.md` for the protocol.
2. Read `.f-mark/config.json` to find the port (default 7777) and existing participants.
3. Read `.f-mark/.token` for the bearer token (skip if `--no-auth`).
4. If you do not have a participant id yet, register one (see `api.md`).
5. Find the active session: `GET /sessions` and use the newest, or use the session id supplied by the user.

## Your turn

1. `GET /sessions/<id>/events?since=<last_seen>` to read everything new.
2. Plan your contribution.
3. POST events:
   - Named prose for durable contributions (`POST /events/prose` with `name`).
   - Unnamed prose for messages.
   - Choices for asking the user to pick.
   - Comments (prose with `target`) for commenting on a specific file.
4. POST `turn-end` when finished.

## Revising

Never edit files directly. To revise a contribution, POST a new prose with `supersedes: <old_filename>`. Keep the same `name` if it's a named contribution.

See `api.md` for the full HTTP reference.

# Auto-stream hook — smoke coverage

This document records what is (and isn't) covered by the automated
end-to-end test for the auto-stream hook pipeline, and what would still
need a manual Claude Code run to fully verify.

## Status

- **Date:** 2026-05-23
- **Owner:** roey
- **Plan source:** `docs/superpowers/plans/2026-05-23-auto-stream-hook.md`, Task 23

Task 23 was originally specified as a manual smoke against a real
Claude Code session. We replaced it with an automated integration test
that exercises the same pipeline end-to-end against a real Fastify
kernel, without requiring an external Claude Code binary or live LLM
calls. Manual verification of the rendered UI is still recommended once,
to confirm the renderer projection in a browser, but the hook→kernel
contract is now under CI.

## What the automated test covers

File: `packages/kernel/tests/integration/auto-stream-e2e.test.ts`

The test spins up a real Fastify kernel via `createServer` and binds
it to a random local port (`app.listen({ host: "127.0.0.1", port: 0 })`).
It writes a `.f-mark/config.json` pointing at that port and a `.token`
file so the in-process hook bootstrap (`loadHookContext`) can discover
the kernel exactly as the production CLI would.

It then:

1. Registers an agent participant (`ag-claude`) via `registerAgent`.
2. Creates a session via `createSession`.
3. POSTs to `/agents/:id/link` via real `fetch` against the bound port,
   exercising the active-session pointer write path end-to-end.
4. Writes a fake JSONL transcript mimicking Claude Code's
   `transcript_path` payload, with the multi-block shape the projection
   logic is designed for:
   - user text prompt
   - assistant turn with arbitrary prose + tool_use
   - user tool_result
   - assistant turn with concluding prose
5. Invokes `runAutoStream("ag-claude", "assistant", stdin)` directly —
   the same entry point the CLI subcommand wraps.
6. Reads the session folder on disk and asserts:
   - exactly **1** arbitrary-prose file (`arbitrary: true` frontmatter,
     contains "I'll search for files.")
   - exactly **1** tool-use JSON file (`tool_name: "Bash"`,
     `tool_use_id: "tu_e2e"`, `success: true`,
     `result: "a.txt\nb.txt"`)
   - exactly **1** concluding-prose file (no `arbitrary` frontmatter,
     contains "Found a.txt and b.txt.")
   - exactly **1** turn-end file carrying `participant_id: "ag-claude"`

A second test verifies the short-circuit path: when
`stop_hook_active: true`, no event files are written and the hook exits
0.

## What the automated test exercises across the codebase

Tasks 7–14 of the plan, end-to-end:

- **Task 7:** Active-session pointer helpers (`writeActiveSession`,
  `readActiveSession`).
- **Task 8:** `POST /agents/:id/link` route — verified over real HTTP.
- **Task 9:** Transcript JSONL parsing (`extractLastAssistantTurn`).
- **Task 10:** Block-to-event projection (`projectTurnToEvents`) —
  arbitrary vs concluding text classification, tool_use pairing with
  tool_result, ordering preserved.
- **Task 11:** Hook bootstrap (`loadHookContext`) — `.f-mark/` walk-up,
  config + token discovery.
- **Task 12:** HTTP poster (`postProjectedEvents`) — multi-event POST,
  conditional turn-end suffix.
- **Task 13:** Top-level `runAutoStream` orchestration for both
  `assistant` and `stop_hook_active` short-circuit branches.
- **Task 14:** Indirectly exercises the entry path that the CLI
  subcommand `f-mark hook auto-stream` delegates to.

Together with the existing unit tests under `tests/hooks/` (which mock
`fetch`), the new integration test gives the first proof that the
pipeline holds together across module boundaries against a real kernel.

## What is NOT covered automatically

Things that still warrant a one-off manual smoke against real Claude
Code, before considering this hook production-ready:

1. **Real `transcript_path` shape from Claude Code.** Our test transcript
   is hand-rolled to match the documented schema. Claude Code may emit
   blocks of other types (e.g. `thinking`, future block kinds) that the
   projection logic must tolerate. Our transcript parser explicitly
   ignores unknown block types, but a live transcript will validate that
   assumption.
2. **The Stop hook wiring itself.** Claude Code is the entity that
   invokes the CLI subcommand with the right JSON payload on stdin —
   the integration test bypasses the OS-level process invocation and
   stdin pipe. Task 21's skill assets contain the settings.json snippet
   that registers the hook; that snippet has never been executed by a
   real Claude Code instance in CI.
3. **The renderer projection.** The grouped feed (arbitrary group with
   collapsed prose + tool-use, separate concluding card) is covered by
   the renderer unit tests (`tests/shell/feed-projection.test.tsx`,
   `tests/cards/ArbitraryGroupCard.test.tsx`, etc.), but no automated
   test renders the full pipeline output in a browser environment.
4. **WebSocket fan-out timing.** The integration test inspects files on
   disk after `runAutoStream` returns. The `event_added` WebSocket
   broadcast that happens inside each `POST /events/...` handler is
   tested separately in `tests/ws.test.ts` and `tests/watcher.test.ts`,
   but not jointly with the hook in a single test.

## Recommended manual verification (one-off)

For full confidence, run the original manual smoke from Task 23 of the
plan once before declaring the feature shipped:

1. `pnpm -r build`
2. Start the kernel in a scratch project:
   `cd /tmp/fmark-smoke && node /home/roey/workspace/F-Mark/packages/kernel/dist/cli.js --no-auth --port 7780`
3. Install the Claude skill: copy
   `packages/kernel/assets/claude-skill/f-mark/` into `.claude/skills/`.
4. Register a participant + create a session + link via curl
   (see Task 23 in the plan for the exact commands).
5. Install the Stop hook snippet from Task 21 into `.claude/settings.json`.
6. Run a Claude Code session; ask it to do something with at least one
   tool call.
7. Open the renderer URL and confirm the grouped feed matches the
   expectation in Task 23.

If that one-off smoke passes, no further manual verification is needed —
the integration test in CI will catch any regression in the wired-up
pipeline.

## Results

| Suite | Before | After |
|---|---|---|
| Kernel tests | 185 | 187 (+2) |
| Renderer tests | 269 | 269 |
| Build | clean | clean |

The two new tests live under
`packages/kernel/tests/integration/auto-stream-e2e.test.ts`. They take
roughly 250ms together, are pure node fs + a bound localhost socket,
and require no external services.

## Codex coverage (Task 26)

The auto-stream pipeline is runtime-agnostic at the CLI seam (`f-mark hook auto-stream <id>`). What's verified automatically:
- Codex-shaped stdin payload (with `turn_id`, `last_assistant_message`, `model`, `permission_mode` fields the CLI doesn't read) is accepted — the extra fields are JSON.parsed and ignored.
- Same transcript JSONL format yields the same event projection (text → prose, tool_use → tool-use, etc.).
- See: `tests/integration/auto-stream-e2e.test.ts` — the "works with Codex-shaped stdin payload" case.

What still needs manual Codex verification before shipping:
- Real `~/.codex/config.toml` or `.codex/config.toml` TOML registration of `[[hooks.Stop]]` and `[[hooks.UserPromptSubmit]]` and confirmation that Codex actually invokes the command with the documented payload.
- Trust-prompt UX on first invocation (Codex requires user trust for hook commands).
- `--dangerously-bypass-hook-trust` flow for headless / `codex exec` runs.
- Verification that Codex's transcript JSONL exposes `text` and `tool_use` blocks in the same shape as Claude Code (likely yes per OpenAI's hook docs, but only a live smoke confirms).

To run a real smoke:
1. Install Codex CLI: `npm i -g @openai/codex` (or whatever current install command is)
2. Set up an F-Mark project, register an `ag-codex-*` agent, link a session.
3. Add the TOML hook block from `packages/kernel/assets/codex-skill/f-mark/SKILL.md`.
4. Start Codex against the project. Ask it to use a tool. Approve the trust prompt.
5. Watch the F-Mark renderer for the grouped events.

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

## Gemini coverage (Task 29)

Gemini CLI supports lifecycle hooks (`AfterAgent`, `BeforeAgent`,
`AfterTool`, `BeforeTool`) but its `transcript_path` JSONL uses a
Gemini-specific schema (`type: "user" | "gemini"`, sibling
`toolCalls: ToolCallRecord[]` arrays, `PartListUnion` content from
`@google/genai`) that F-Mark's existing transcript parser (designed
around Claude Code's `{ role, content: [{ type, text/tool_use/... }] }`
shape) cannot consume. The `AfterAgent` payload alone supplies only a
flat `prompt_response: string` — no mid-turn narration, no tool calls,
no tool results — which would collapse every tool-using turn to a single
concluding-prose card in the F-Mark feed.

Task 27 (research) concluded that the right Phase-8 choice is the
plan's **manual-POST fallback**: the Gemini skill instructs the model
to POST `arbitrary: true` narration, `tool-use` events, a concluding
`arbitrary: false` prose, and a `turn-end` — producing a renderer feed
identical to the hook-driven runtimes. See:
`docs/superpowers/plans/2026-05-23-gemini-hooks-research.md`.

### What's auto-verified

Nothing new in the integration test, by design. The auto-stream
pipeline (`packages/kernel/src/hooks/autoStream.ts` and friends) is not
exercised by Gemini — the model writes directly to the existing prose /
tool-use / turn-end endpoints, which are already covered by the kernel
route tests (`tests/events.test.ts`, `tests/routes/toolUse.test.ts`,
etc.). No `f-mark hook auto-stream` invocation occurs in the Gemini
flow, so no Gemini-shaped stdin test case is appropriate or
informative.

### What still needs manual verification before shipping

Because the producer is the model itself (not the hook system), the
manual smoke is the *only* verification that matters for Gemini:

1. **Skill discovery.** Confirm Gemini auto-loads the skill from the
   installed location, and the model reads `SKILL.md` + `api.md` when
   the session triggers F-Mark detection.
2. **Bootstrap + link.** Model successfully registers a participant
   (`ag-gemini-*` namespace), links to a session via
   `POST /agents/<id>/link`.
3. **Manual stream — tool-using turn.** Model emits the documented
   sequence (`arbitrary: true` prose → `tool-use` → optional more of
   each → final `arbitrary: false` prose → `turn-end`) for a turn that
   includes ≥1 tool call.
4. **Manual stream — tool-free turn.** Model emits exactly one
   `arbitrary: false` prose + one `turn-end` and nothing else for a
   turn with no tool calls.
5. **Renderer projection.** F-Mark renderer groups the Gemini turn into
   the same mid-turn-box-then-concluding-card shape as the Claude /
   Codex auto-streamed turns — no visual distinction from the
   hook-driven runtimes.
6. **Multiple agents.** A session with both a Claude-Code-driven
   (auto-stream) agent and a Gemini-driven (manual-stream) agent shows
   coherent, distinct streams — no cross-contamination of
   `participant_id`s.

### Step-by-step manual smoke procedure

Prereqs: Gemini CLI installed (`npm i -g @google/gemini-cli`), F-Mark
built (`pnpm -r build`).

1. **Bootstrap a scratch project.**
   ```bash
   mkdir /tmp/fmark-gemini-smoke && cd /tmp/fmark-gemini-smoke
   node /home/roey/workspace/F-Mark/packages/kernel/dist/cli.js --no-auth --port 7790 &
   ```
2. **Install the Gemini skill.** Copy the bundled skill into Gemini's
   skill discovery location. Confirm the exact path on your Gemini
   version — the canonical layout is
   `~/.gemini/extensions/f-mark/skills/f-mark/{SKILL.md,api.md}` with a
   minimal `gemini-extension.json` manifest at the extension root.
   ```bash
   mkdir -p ~/.gemini/extensions/f-mark/skills/f-mark
   cp /home/roey/workspace/F-Mark/packages/kernel/assets/gemini-skill/f-mark/* \
      ~/.gemini/extensions/f-mark/skills/f-mark/
   cat > ~/.gemini/extensions/f-mark/gemini-extension.json <<'JSON'
   { "name": "f-mark", "version": "0.1.0" }
   JSON
   ```
3. **Register a participant + create a session** (manually, via curl,
   since Gemini hasn't connected yet):
   ```bash
   curl -X POST http://localhost:7790/participants/register \
     -H 'Content-Type: application/json' \
     -d '{"kind":"agent","name":"Gemini","suggested_id":"ag-gemini"}'
   curl -X POST http://localhost:7790/sessions \
     -H 'Content-Type: application/json' -d '{"slug":"gemini-smoke"}'
   ```
   Note the returned session id (e.g., `2026-05-23-gemini-smoke`).
4. **Open the F-Mark renderer** at `http://localhost:7790/` and pin the
   smoke session.
5. **Start Gemini in the project directory.** Ask it something that
   triggers ≥1 tool call. Example:
   > "Read the package.json in this directory, list the dependencies,
   > then write a short summary."
6. **Expected behavior.** Gemini reads `SKILL.md`, registers (or reuses)
   `ag-gemini-*`, links the session, then emits:
   - one `arbitrary: true` prose ("I'll read the package.json…")
   - one `tool-use` event (Read with input/result)
   - one `arbitrary: false` prose (the summary)
   - one `turn-end`
7. **Verify the renderer.** The grouped mid-turn box shows the
   arbitrary prose + tool-use; the concluding card shows the summary;
   the turn closes cleanly.
8. **Tool-free turn check.** Follow up with a tool-free question
   ("What's the most interesting dep?"). Expect exactly one
   `arbitrary: false` prose + one `turn-end`. No mid-turn box.
9. **Cross-agent check (optional).** From a separate Claude Code
   session in the same project (with the auto-stream hook installed,
   per the original smoke), interact with the same session. Both
   participants' streams should appear correctly, no
   participant-id confusion.
10. **Tear down.** `kill %1` to stop the kernel; `rm -rf
    /tmp/fmark-gemini-smoke`.

If steps 5–8 produce the documented feed without intervention, the
Gemini integration is shipping-ready as-is. If the model misorders
events, fails to set `arbitrary: true` on mid-turn prose, or skips the
`turn-end`, the gap is in the SKILL.md prose itself (not in F-Mark) and
should be tightened there. The integration test suite (kernel 188,
renderer 279) is unchanged for Task 29.

### Future: hook-driven Gemini mode

The Phase-8 manual-POST mode is intentionally future-compatible with a
later hook-driven mode. Adding it requires:
1. A Gemini-flavored transcript parser
   (`packages/kernel/src/hooks/geminiTranscript.ts`) that consumes the
   `MessageRecord` / `ToolCallRecord` shape from
   `@google/gemini-cli/core/src/services/chatRecordingTypes.ts`.
2. A switch in `runAutoStream` (or a sibling entry point) that selects
   the parser by stdin payload shape.
3. An updated SKILL.md "Streaming (hook mode)" section paralleling the
   Codex skill, gated on a settings toggle.

None of this is in scope for Tasks 27–29.

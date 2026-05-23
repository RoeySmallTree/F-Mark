# v0.4 Real-Agent Browse Findings — AGGREGATE

6 parallel Sonnet subagents drove real headless browsers against the assembled kernel + renderer, against real Claude / Codex / Gemini CLIs where possible. No happy paths — adversarial edge cases only.

**Total: ~32 distinct bugs.** 3 release-blockers, 7 high-severity, 10 medium, 12 low.

## Per-subagent files

| File | Subagent | Scope |
|---|---|---|
| `01-claude.md` | A | Real Claude Code integration |
| `02-codex.md` | B | Real Codex (auth'd via ChatGPT mode) |
| `03-gemini.md` | C | Gemini manual-stream protocol (no API key — kernel API tests only) |
| `04-spawn-race.md` | D | Spawn lifecycle + race + invalid payloads |
| `05-terminal-overlay.md` | E | Terminal overlay + pane WS |
| `06-security-reconcile.md` | F | Security gates + reconcile-on-restart |

## 🔴 Release blockers

| # | ID | Bug | Found by | Fix complexity |
|---|---|---|---|---|
| 1 | E-P0 | Unhandled promise rejection in `server.ts:225` (`void pipeControls.startPipe(id)`) crashes Node when tmux pipe-pane fails on a dead session. Side effect: leaks 241 FIFO dirs at `/tmp/fmark-pipe-*`. Restart attempts fail with `EMFILE`. | E | One-line: add `.catch(() => {})` |
| 2 | F.8 | Privilege escalation: `validateRuntimeEntry` allows `/bin/sh` + arbitrary `args`. Editing `runtimes.json` to `{"executable":"/bin/sh","args":["-c","cmd"]}` and spawning **executes the command** (confirmed: wrote `pwn.txt`). | F | Tighten regex + allowlist + path resolution |
| 3 | A-BUG-1 | `config.json` always writes `port: 7777` regardless of the `--port` flag. **Silently breaks the entire hook pipeline for any non-default-port deployment** — hook POSTs go to wrong kernel. Every test in this session that I declared "passing" with a custom port had this latent. | A | Pass `port` into `initProject` or write it on first listen |
| 4 | C-HIGH-1 | `turn-end` events sort BEFORE the concluding prose 100% of rapid turns. Root cause: second-precision timestamps; `prose.md` and `turn-end.json` have different filename extensions so they don't collide → `turn-end` keeps its second, the prose gets bumped +1s. Feed reader sorts lexicographically → wrong order every time. **This is a v0.3.0 regression — affects all agents, not just Gemini.** | C | Sub-second timestamps or filename ordinal |

## ⚠️ High severity

| # | ID | Bug | Found by |
|---|---|---|---|
| 5 | C-HIGH-2 | WebSocket `event_added` is **broadcast twice**: chokidar watcher AND `registerEventRoutes` both publish. Every client receives every event twice. | C |
| 6 | B-HIGH-1 | `config.json` concurrent-write race in `registerAgent()` — read→modify→write with no lock. 10 concurrent spawns → 2 persist, 3-4 return `"Unexpected end of JSON input"`. Ghost sessions: alive in tmux, invisible to F-Mark. | B (D found independently) |
| 7 | B-HIGH-2 | `extractLastAssistantTurn()` parses transcript JSONL with no try/catch. Any debug line, partial write, or non-JSON content throws → entire turn dropped silently. | B |
| 8 | B+A | `tracker.setManagedPane()` is called with `{ paneAlive: () => true }` — hardcoded constant closure. **No other code updates `paneAlive` after spawn.** Chip never reaches `pane-dead` during a live session; only reachable on reconcile-after-restart. The spec's "pane-dead detection via tmux liveness" is fiction in practice. | B + A independently |
| 9 | A-BUG-4 | No REST `/agents/.../presence` snapshot endpoint. All chips show `offline` after every browser reload because `reconcile()`'s broadcasts happen before the browser's WS connects. | A |
| 10 | A-BUG-5 | "Say goodbye" doesn't remove participant from `config.json` AND renderer has no `removeParticipant` action → zombie chips persist after delete. | A |
| 11 | E-P1 | When tmux session dies externally, `/ws/pane` stays `OPEN` with no `pane.exit` message. xterm silently freezes — user sees no signal that the pane is dead. | E |

## 🟡 Medium severity

| # | ID | Bug | Found by |
|---|---|---|---|
| 12 | C-MED-1 | Spawn does NOT auto-install the Gemini skill bundle into `.gemini/skills/`. Freshly-spawned Gemini has no protocol knowledge. | C |
| 13 | C-MED-2 | Gemini's interactive trust dialog blocks first-run in any project not in `~/.gemini/trustedFolders.json`. Kernel doesn't pre-approve. Kickoff message fires into the dialog. | C |
| 14 | C-MED-3 | Gemini chip never transitions to `online`: ping is the only path, but `SKILL.md` doesn't instruct Gemini to call `/agents/:id/ping`, and the events route doesn't either. Stuck at `stale` forever. | C |
| 15 | B-MED-2 | `for (const block of e.content)` throws `TypeError` when content is null. Same silent hook crash as #7. | B |
| 16 | D-MED-1 | TOCTOU on `POST /managed-agents/terminal`: reads `maxIdx` then writes. 10 concurrent → 1 wins, 9 get HTTP 500 `duplicate session`. | D |
| 17 | D-MED-2 | Sporadic 400 `"Unexpected end of JSON input"` on rapid browser spawns (1 of 10). Same root as #6 from a different angle. | D |
| 18 | E-P2 | Late subscribers miss mid-stream data — joins via `pane.snapshot` but gets 0 `pane.data` chunks of in-progress output. No ring buffer. | E |
| 19 | A-BUG-2 | Duplicate `suggested_participant_id` returns 500 Internal Server Error instead of 409 Conflict. | A |
| 20 | F.7 | Rogue tmux sessions without `@fmark-project` user option are invisible to reconcile — neither listed nor cleaned up. Persist indefinitely. | F |
| 21 | F-OPS | System inotify exhaustion (`max_user_instances=128`, 126 consumed by parallel subagents) **crashes kernel** via unhandled chokidar error during startup. No graceful degradation. | F |

## 🟢 Low / minor

| # | ID | Bug | Found by |
|---|---|---|---|
| 22 | D-LM-1 | `session_id` in spawn payload accepted without validation. `../../../etc/passwd` written verbatim into `active-session` and kickoff message. | D |
| 23 | D-LM-2 | 500 responses leak internal session-name format (`fmark-<slug>-<hash>-ag-<id>`). | D |
| 24 | D-L-1 | Ghost participant entries in `config.json` when spawn fails post-`registerAgent` (color slot consumed). | D |
| 25 | D-L-2 | `GET /managed-agents/<id>/confirm-token` issues a real token for a participant id that was never registered. Subsequent DELETE returns 200 + writes a stray log. | D |
| 26 | D-L-3 | A second `GET /confirm-token` for the same agent silently invalidates the first token (Map overwrite — no warning). | D |
| 27 | D-L-4 | `pane.key` WS messages bypass `validateMessageText`. Null bytes accepted; `pane.input` correctly rejects them. | D |
| 28 | E-MIN-1 | `pane.resize` with `cols: "abc"` (NaN) forwarded blindly. Tmux returns "width invalid". No kernel-side guard. | E |
| 29 | E-MIN-2 | 100KB `pane.input` passes `validateMessageText` — only rejected by tmux. No client length cap. | E |
| 30 | E-MIN-3 | `pane.resize` 1x1 accepted; 9999x9999 accepted. No range clamp. | E |
| 31 | F.6 | Missing `tmux-session` file → orphan `runtime` + `log.jsonl` files remain (`clearManagedSiblings` never called because agent is invisible to `listManagedAgentIds`). | F |
| 32 | A-MIN-1/2 | "Rename" and "Show last failure" in the agent action menu are v0.4 stubs that accept user input then silently discard it with only a `console.log`. No user feedback. | A |

## 🛡️ Confirmed working

- **Cookie-auth + Origin matrix**: all 7 cases enforced correctly (bearer bypasses Origin; cookie + foreign Origin → 403; cookie + no Origin → 403; cookie + localhost → 200; replay across browser contexts works as documented)
- **Bearer auth**: 401 on wrong/missing token
- **confirm-token TTL race**: exactly one of two simultaneous DELETEs wins (200), one loses (403)
- **Path traversal**: participant_id, session slugs, slash command names, message text — all blocked at the appropriate layer; `assertWithinSession` adds defense-in-depth
- **`pane.input` control-char rejection**: works
- **Pane WS fan-out**: single `tmux pipe-pane` per pane regardless of subscriber count, in-memory broadcast confirmed across multiple browser contexts
- **Spawn rollback (post-tmux-spawn failures)**: tmux session cleaned up when `writeRuntime` fails
- **TOML hook detection** (Codex): handles comments, inline `#`, hashes in strings, multiline arrays, mixed formats, user/project split — 18 edge cases all pass
- **UTF-8, emoji, ANSI escape passthrough** in terminal overlay
- **High-throughput streaming** (no observable drops at moderate rates)
- **Reconcile-on-restart (CASE A + B + C)**: agents + terminals all come back after `kill -9 kernel` (in containers where SIGKILL is permitted) with correct hook-status seeding
- **Auth gates under `--no-auth`** without `--allow-process-api-no-auth`: spawn/kill/list all return documented 404
- **Banner warning** when dangerous flag combo is set

## Severity meta

| Severity | Count | Notes |
|---|---|---|
| 🔴 Release-blocker | 4 | E-P0 (1-line fix), F.8 (regex tighten), A-BUG-1 (port not persisted), C-HIGH-1 (timestamp ordering) |
| ⚠️ High | 7 | Mostly **v0.3.0 infrastructure regressions** that v0.4 exposes — turn ordering, double-broadcast, JSONL crash, paneAlive constant, race conditions |
| 🟡 Medium | 10 | UX gaps, missing hooks, validation holes |
| 🟢 Low | 11 | Validation edges, leak hints, stubs |

## The honest verdict

**v0.4 is not shippable.** Not the "small fixes" I claimed before browse-testing — there are deep infrastructure cracks that browse-testing exposed:

1. **Several "v0.4 bugs" are actually v0.3.0 bugs the new surface aggravates** — the JSONL parse crash, the config.json write race, the `--port` flag bug, the WS double-broadcast, the turn-end timestamp ordering. These have been silently affecting v0.3.0 too; v0.4's higher concurrency made them visible.
2. **The "presence + tmux liveness" model in the spec is a paper promise** — `paneAlive: () => true` was never wired to a real check (B + A both caught this independently from different angles). Spec drift the buddy reviews didn't catch because no test exercised the real path.
3. **The release-blockers are mostly one-liners or small** — they're not architectural, just oversights. But they collectively mean every non-trivial use of v0.4 will hit at least one of them.

**Counts of subagents that found "this works":** confirmation column is meaningful — F's auth matrix, B's TOML edge cases, E's fan-out, the cookie/CSRF gate — these are genuine wins from real tests.

## Recommended next steps (ordered by ratio)

1. **Fix the 4 release-blockers first**, all one-day work:
   - `void pipeControls.startPipe(id).catch(() => {})` in `server.ts`
   - `initProject` / kernel startup writes the actual `--port` to config.json
   - Tighten `validateRuntimeEntry` to reject `/bin/sh`, `/bin/bash`, etc.; require executable to live under common bin paths OR explicit allowlist
   - Switch event-file timestamps to millisecond precision, or add a per-second ordinal suffix that sorts within the second
2. **Fix the 4 highest-impact HIGHs** (also one-day each):
   - Pick ONE event-add WS publisher (drop chokidar's `event_added`, keep the kernel's direct `bus.publish`)
   - Add a single async lock around `config.json` writes in `registerAgent` and friends
   - Wrap JSONL parse in try/catch + skip bad lines instead of crashing the turn
   - Wire `paneAlive` to a real `tmux.paneAlive()` call on a polling interval
3. **Add an integration test that catches release-blockers** — start kernel with `--port 17912`, spawn an agent, verify `config.json` was written with port 17912. The bug would have failed instantly.
4. **Re-run this 6-subagent suite after fixes** to verify the blockers are closed without new regressions.

After (1) + (2) + (3), v0.4.1 could be honest.

# 03-gemini.md — Gemini CLI Integration Adversarial Test

**Subagent C** | Port 17912 | Temp `/tmp/fmark-C` | Date 2026-05-23

---

## Setup

- Kernel started clean on port 17912 (password `fmark-C`).
- `gemini --version` → **0.43.0** (available).
- No `GEMINI_API_KEY` env var; no Google OAuth session. Auth is unavailable — Gemini cannot execute prompts in this environment.
- All live-protocol tests (C.1, C.5) were performed by calling the kernel API directly (simulating what an authenticated Gemini model would POST), not by driving the Gemini CLI to completion.
- Skill bundle read from `packages/kernel/assets/gemini-skill/f-mark/SKILL.md` before testing.

---

## C.1 — Manual-Stream Protocol

### What was tested
Full `prose(arbitrary:true) → tool-use → prose(final) → turn-end` sequence POSTed directly to the kernel API, simulating the protocol Gemini would follow if authenticated.

### Results

| Step | HTTP | Response |
|---|---|---|
| `POST /sessions/:id/events/prose` (arbitrary) | 200 | `{filename, timestamp, kind, participant_id}` |
| `POST /sessions/:id/events/tool-use` | 200 | Same shape |
| `POST /sessions/:id/events/prose` (final) | 200 | Same shape |
| `POST /sessions/:id/events/turn-end` | 200 | Same shape |

**Protocol accepted correctly.** All four event types are accepted by the kernel API.

### BUG C.1-A — turn-end ordering is systematically inverted

**Severity: High**

The event writer uses second-precision ISO timestamps (`20260523T151142Z`). Within a single second, multiple events are de-collided by the `bumpSecond()` function — but only when the *same* `participant_id + kind + ext` combination would collide. Different event kinds get unique filenames even at the same second.

Observed ordering in the event feed for a rapid turn sequence:

```
20260523T151142Z  prose       (arbitrary narration)    ← slot taken first
20260523T151142Z  tool-use    (tool call)
20260523T151142Z  turn-end                             ← gets this slot (different kind)
20260523T151143Z  prose       (final response)         ← bumped because .prose.md at 151142Z taken
```

**The turn-end appears before the concluding prose.** The renderer sees `turn-end` before it sees the final response, so it will close the turn group prematurely. This is systematic — reproduced across every turn in the C.5 multi-turn test.

**Root cause:** `bumpSecond()` is only triggered on filename collision (`EEXIST`). Different kinds (`prose`, `turn-end`) never collide with each other at the same second, so both land at `151142Z` even though `turn-end` was the last to be POSTed. The final prose, which collides with the earlier `prose.md` at `151142Z`, gets bumped to `151143Z` — a *later* timestamp than turn-end.

**Reader sorting:** `readEvents` sorts purely by timestamp string. No tiebreak on posting order within the same second.

---

## C.2 — Skill Bundle Loading

### Observation 1: Skill NOT auto-installed on spawn

The spawn API (`POST /managed-agents/spawn`) creates the tmux session and writes `.f-mark/agents/<id>/tmux-session`, but **does not** create `.gemini/skills/f-mark/` in the project directory.

The bundled skill lives at `packages/kernel/assets/gemini-skill/f-mark/SKILL.md`. Gemini's own skill loader scans `.gemini/skills/` directories in the cwd and ancestors. Since no `.gemini/skills/f-mark/` exists in the project, **the spawned Gemini process has no access to the f-mark skill.**

The kernel's own `/skills?agent=gemini` route also returns an empty list for the project root.

**This means Gemini cannot know the manual-stream protocol unless the user manually installs the skill.**

### Observation 2: Trust dialog blocks all interaction on first spawn

When Gemini is spawned in a folder not in its trusted-folders list, it shows a blocking interactive dialog:

```
Do you trust the files in this folder?
  ● 1. Trust folder (F-Mark)
    2. Trust parent folder (workspace)
    3. Don't trust
```

The spawn API's kickoff message (sent via `sendLiteralText`) fires into this dialog. In the observed test, the `/compact` text typed as a slash command caused Gemini to restart (re-displayed the trust prompt). **No kickoff message is received by the model.**

The `/managed-agents/spawn` route does not pre-populate `trustedFolders.json`, so every fresh spawn in a new project requires manual interaction before Gemini can read its AGENT.md.

### BUG C.2-A — spawn does not install the f-mark skill into .gemini/skills/

**Severity: High**

Without `packages/kernel/assets/gemini-skill/f-mark/` being copied to `.gemini/skills/f-mark/` on spawn, Gemini has no knowledge of the manual-stream protocol. In practice this means a freshly spawned Gemini (even if authenticated and past the trust dialog) will not POST events to F-Mark unless the user separately installs the skill.

### BUG C.2-B — trust dialog is not bypassed on spawn

**Severity: Medium**

The kernel can pre-approve the project directory in `~/.gemini/trustedFolders.json` before spawning Gemini. It does not do this. The spawned pane blocks at the trust dialog until a human interacts with the overlay.

---

## C.3 — Chip Ping vs Event Broadcast

### Presence state after spawn

The spawn route detects `hooks_status = "not_required"` for Gemini (since `detectGeminiHooks()` always returns `{ installed: false, expectedEntries: [] }`). With no expected entries, the route calls `markReconciledStale(participantId, { paneAlive: () => true })`.

`markReconciledStale` sets:
- `hooksInstalled = true`
- `lastHookAt = now - ONLINE_MANAGED_TTL_MS - 1` (120 001 ms ago)
- `paneAlive = () => true`

`deriveState` with these values → `"stale"` (not `"hook-not-installed"`).

**Initial WS broadcast on spawn:**
```json
{ "type": "presence", "participant_id": "ag-gemini-2ac4", "state": "stale", "last_hook_at": 1779549261291 }
{ "type": "managed-agent.spawned", ... }
```

So the chip starts as `stale`, not `hook-not-installed` — which is better than the earlier UX finding. However:

### BUG C.3-A — Gemini presence never transitions to 'online' in manual-stream mode

**Severity: Medium**

The only path that sets `lastHookAt = now` is `tracker.ping()`, called from `POST /agents/:id/ping`. The events route (`POST /sessions/:id/events/prose`, etc.) does **not** call `tracker.ping()`. The SKILL.md protocol documentation never mentions calling `/agents/:id/ping`.

Result: a Gemini agent can POST hundreds of events and its chip will remain `stale` until the 600-second `OFFLINE_TTL_MS` expires, then flip to `offline`. It never shows `online`.

The renderer has no code path to dispatch a ping from an `event_added` WS message (verified: presence tracker is not touched in `registerEventRoutes`).

**Fix options:** (a) Call `tracker.ping()` in the events route when an event arrives from an agent participant, or (b) Add a note to SKILL.md instructing the model to call `POST /agents/:id/ping` when it starts a turn.

---

## C.4 — /compact, Interrupt, Kill

### /compact

`POST /managed-agents/ag-gemini-c708/command` with `{"type":"slash","command":"compact"}` returns `{"ok":true}`. The command is accepted.

However, since Gemini was stuck at the trust/auth dialog, the text `/compact\n` was typed into the interactive prompt. Gemini restarted to re-apply trust settings. **The /compact command had no effect on the agent's context — it was interpreted as input to the Gemini CLI's initialization dialog, not its REPL.**

There is no guard in the command route that checks whether the agent is in a usable state before sending keystrokes. The route always succeeds if the tmux session exists.

### Interrupt

`{"type":"interrupt"}` sends `C-c` to the tmux session. In the test, Gemini was at its "Use Gemini API Key" auth dialog. Ctrl-C dismissed one level of the dialog but Gemini remained running — it printed `"Press Ctrl+C again to exit."` Multiple Ctrl-C presses would eventually exit, but a single interrupt does not kill the process.

### Kill via DELETE

`GET /managed-agents/:id/confirm-token` → `DELETE /managed-agents/:id?confirm=<token>` works correctly. The flow:
1. Kills the tmux session.
2. Clears `.f-mark/agents/<id>/` pointers.
3. Calls `tracker.clearManagedPane(id)`.
4. Publishes `{"type":"managed-agent.killed","participant_id":"..."}` on the WS bus.

**No presence state message is emitted on kill.** The `clearManagedPane` call removes the `paneAlive` closure (which would cause `deriveState` to no longer return `pane-dead`), but does not trigger a state-change broadcast. The renderer only learns about the kill via the `managed-agent.killed` message.

---

## C.5 — Multi-Turn Manual Stream

Three turns (tool-using, tool-free, multi-tool) were POSTed in sequence. Observed feed order for all three turns showed the same pattern as C.1-A:

```
Turn 1:  prose(arb)  tool-use  turn-end  | final-prose
Turn 2:  turn-end    | final-prose
Turn 3:  turn-end    | prose(arb) tool-use prose(arb) tool-use | final-prose
```

The `|` marks where turn-end appears in the feed relative to the prose it should follow. In **every single turn**, `turn-end` appears before the concluding prose.

Additionally, `Turn 3`'s turn-end and first tool-use both landed at `151946Z`, while Turn 2's final prose also landed at `151946Z` — producing three events at the same timestamp with no stable intra-second ordering.

**The multi-turn protocol is structurally broken for rapid submissions.** A model that posts events as fast as the kernel allows will always have its `turn-end` precede the final prose in the rendered feed.

---

## Additional Finding — Double WebSocket Broadcast

**Severity: High** (cross-cutting, affects all agents, not Gemini-specific)

Every `event_added` WS message is delivered **twice** to every connected client.

**Root cause:** Two independent code paths both publish to the same bus:

1. `registerEventRoutes` (in `routes/events.ts`) calls `bus.publish(added)` immediately after `writeEventFile` succeeds.
2. `startWatcher` (in `watcher.ts`), started in `index.ts:102`, watches the sessions directory with `chokidar` and publishes `event_added` on every new file.

Since both run for every API write, each client receives the event twice. The watcher has no deduplication logic.

**Observed:** `POST /sessions/:id/events/prose` → WS client receives `event_added` with the same filename twice, confirmed in multiple isolated tests.

**Impact:** The renderer will render each event twice in the feed. If it deduplicates by filename this may be benign, but it is a correctness bug and wastes bandwidth.

---

## Summary Table

| Finding | Severity | Category |
|---|---|---|
| C.1-A: turn-end timestamp precedes final prose | High | Protocol ordering |
| C.2-A: f-mark skill not auto-installed on spawn | High | Skill loading |
| C.2-B: trust dialog blocks spawned Gemini | Medium | Spawn UX |
| C.3-A: chip never transitions to 'online' (no ping in manual-stream) | Medium | Presence state |
| C.4: /compact/interrupt sent into wrong pane state | Low | Command routing |
| C.4: no presence message on kill (clearManagedPane vs markPaneDead) | Low | Presence state |
| Additional: double WS broadcast for every event | High | WebSocket |

---

## Live Gemini Execution Status

Gemini v0.43.0 is installed but requires `GEMINI_API_KEY` or Google OAuth. Neither was available in this environment. All protocol-level tests were performed by calling the kernel API directly. The trust-dialog and auth-dialog behaviors were observed by inspecting the spawned tmux pane.

# Real Claude Code Integration — Findings (Subagent A)

## Environment
- Date: 2026-05-23
- Kernel commit: `f674f2a fix(kernel): wipe stale renderer bundle on build + warn when both exist`
- Claude version: 2.1.128 (Claude Code)
- Was Claude authenticated? YES
- Test kernel: `/tmp/fmark-A`, port 17910
- Note: Multiple other subagent kernels running on ports 17911–17930 caused EMFILE pressure during testing (file watcher exhaustion), causing intermittent kernel crashes. Tests requiring a stable kernel were retried after fresh start.

## Per-test results

| Section | Test | Result | Evidence |
|---|---|---|---|
| A.1 | Claude CLI authenticated | PASS | `echo "hi" | claude -p "say ok in one word"` returned "ok" |
| A.1 | Spawn Claude via API | PASS | `POST /managed-agents/spawn` returns participant_id, hooks_status=missing |
| A.1 | Hook install instructions API | PASS | `POST /managed-agents/hook-install-instructions` returns JSON markdown snippet |
| A.1 | Hook install writes to settings.json | PASS | Merged Stop + UserPromptSubmit hooks, detected by `hook-install-status` API |
| A.1 | Hook status API reports installed=true after write | PASS | `installed=true, detectedEntries=[Stop, UserPromptSubmit]` |
| A.1 | Hook fires and pings kernel | FAIL-BLOCKED | Hook runs but connects to **wrong kernel** (port 7777 not 17910) — see BUG-1 |
| A.1 | Chip data-state attribute shows hook state | FAIL | chip has `data-state` not `data-presence`; state shows "offline" not "hook-not-installed" after restart — see BUG-4 |
| A.2 | Concurrent API spawns both succeed | PASS | Two concurrent POSTs returned different participant IDs at HTTP 200 |
| A.2 | Concurrent spawns get different participant_ids | PASS | id1=ag-claude-199d, id2=ag-claude-11b8 |
| A.2 | Duplicate suggested_participant_id handled gracefully | FAIL | Second spawn with same suggested_id returns HTTP 500 "tmux new-session failed: duplicate session" — see BUG-2 |
| A.2 | Say goodbye while agent mid-turn | PASS | HTTP 200, tmux session correctly killed |
| A.2 | UI shows all spawned chips | PASS | After reload, chips appear for all managed agents |
| A.3 | Interrupt on hook-not-installed agent (API) | PASS-ALLOWED | API returns 200 ok (sends C-c to tmux regardless of hook status) |
| A.3 | Interrupt button disabled in UI when hook-not-installed | PASS | Button correctly disabled=true |
| A.3 | Message with ANSI escape codes rejected | PASS-REJECTED | HTTP 400 "message contains control char at index 19" |
| A.3 | Message with emoji + UTF-8 accepted | PASS | HTTP 200 |
| A.3 | 10000-char message passes through | PASS | HTTP 200 — no truncation, no length limit enforced |
| A.3 | Message with null byte rejected | PASS | HTTP 400 "message contains control char at index 5" |
| A.3 | Invalid slash command path-traversal rejected | PASS | HTTP 400 "invalid slash command: ../../../etc/passwd" |
| A.3 | Valid /compact during mid-turn | PASS | HTTP 200 |
| A.4 | Agent shows alive=false after tmux kill (API) | PASS | `/managed-agents` correctly returns alive=false within one tick |
| A.4 | Chip flips to pane-dead after tmux kill | FAIL | Chip stays "offline" permanently — paneAlive closure never calls real tmux check — see BUG-3 |
| A.4 | Confirm token can't be reused | PASS | HTTP 403 on second use |
| A.4 | Stale confirm token (TTL) rejected | PASS | HTTP 403 after 10s expiry |
| A.4 | Say goodbye (DELETE) kills tmux session | PASS | Session killed, HTTP 200 |
| A.4 | WebSocket reconnect on navigate away+back | PASS | No console errors, app loads cleanly |
| A.5 | Tmux sessions survive kernel kill (SIGTERM) | PASS | All 3 test sessions survived kernel shutdown |
| A.5 | New kernel reconciles surviving agents | PASS | `/managed-agents` returns alive=true for surviving sessions after restart |
| A.5 | Browser shows correct chips after reload | FAIL | 2 zombie chips for deleted/killed agents persist in UI — see BUG-5 |
| A.5 | No zombie chips in UI | FAIL | UI shows 8 chips, API reports 4 agents (4 zombies from previous goodbye+kill ops) |
| A.5 | Participant removed from config.json after goodbye | FAIL | config.json retains participant entry forever — see BUG-5 |
| A.6 | Show last failure button visible in menu | PASS | Button present in chip action menu |
| A.6 | Show last failure is not disabled | PASS | Button is enabled |
| A.6 | Show last failure shows useful content | FAIL | Button is a v0.4 stub: does console.log() and closes menu — no visible UI — see BUG-6 |
| A.6 | Rename button visible in menu | PASS | Button present |
| A.6 | Rename persists to config.json | FAIL | Rename is a v0.4 stub: does console.log() only, no PATCH call — see BUG-7 |
| A.6 | Kernel log has no unhandled errors | PASS | Kernel logs show clean startup and SIGTERM shutdowns only, no unhandled exceptions |
| SEC | CSRF: cookie auth without Origin rejected | PASS | HTTP 403 "cookie-authenticated request missing Origin header" |
| SEC | CSRF: wrong-origin rejected | PASS | HTTP 403 "Origin https://evil.com not allowed" |
| SEC | Path traversal in runtime_id rejected | PASS | HTTP 400 "unknown runtime_id: ../../../etc/passwd" |

## New bugs found

### BUG-1 — CRITICAL: config.json always records port 7777, ignoring --port flag
**Severity: CRITICAL**

`project.ts:initProject()` is called at line 58 of `index.ts`, BEFORE the actual port is bound (line 82). The `defaultConfig()` function hardcodes `port: DEFAULT_PORT = 7777`. Once written, `config.json` is never updated with the actual bound port.

**Impact**: Any hook running in a project directory where the kernel was started with `--port X` (X != 7777) will call `loadHookContext()` which reads `config.json` and constructs `kernelUrl = http://localhost:7777`. All auto-stream hook events (pings, prose events) are silently routed to the WRONG kernel (or lost if port 7777 is not listening). This means **the entire hook-based streaming pipeline is broken for any non-default port**.

**Reproducer**:
```bash
mkdir /tmp/test-port && cd /tmp/test-port
node /path/to/f-mark.js --port 18888 --password test
cat .f-mark/config.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('port =', d['port'])"
# Prints: port = 7777  (should be 18888)
```
**Files**: `packages/kernel/src/project.ts:29`, `packages/kernel/src/index.ts:58,77-92`

---

### BUG-2 — MAJOR: Duplicate suggested_participant_id returns 500 Internal Server Error
**Severity: MAJOR**

If two spawn requests arrive with the same `suggested_participant_id`, the first succeeds and the second returns:
```json
{"statusCode":500,"error":"Internal Server Error","message":"tmux new-session failed: duplicate session: fmark-fmark-a-..."}
```
The tmux duplicate-session error bubbles up as an unhandled 500 instead of being caught and handled gracefully (should be 409 Conflict or silently return the existing session info).

**Reproducer**:
```bash
curl -X POST .../managed-agents/spawn -d '{"runtime_id":"claude","suggested_participant_id":"ag-race-test1"}'
# Then immediately:
curl -X POST .../managed-agents/spawn -d '{"runtime_id":"claude","suggested_participant_id":"ag-race-test1"}'
# Second returns: {"statusCode":500,...,"message":"tmux new-session failed: duplicate session: ..."}
```
**File**: `packages/kernel/src/routes/managedAgents.ts` — `spawnAgent()` catch block around line 206-239

---

### BUG-3 — MAJOR: Chip NEVER flips to pane-dead during live kernel session
**Severity: MAJOR**

When a managed agent's tmux session dies, the presence chip should show `pane-dead`. It does not, even after many tracker tick intervals (5s each).

**Root cause**: The `paneAlive` closure set on spawn is always `() => true` (hardcoded, never replaced with a real tmux check). The presence tracker's `tick()` calls `deriveState()` with this closure and always gets `true`, so `pane-dead` is never returned.

**Evidence**: Killed tmux session for `ag-claude-f965`. API `/managed-agents` correctly shows `alive=false` (that endpoint calls `tmux.listFmarkSessions()` freshly). But UI chip stayed `offline` indefinitely. `pane-dead` only appears after kernel RESTART via `reconcile()` which calls `tmux.listFmarkSessions()` and invokes `tracker.markPaneDead()`.

**Fix needed**: Replace the hardcoded `() => true` with a closure that calls `tmux.paneAlive(sessionName)`, or run a periodic check that calls `tmux.listFmarkSessions()` and updates the tracker for any dead sessions.

**Files**: `packages/kernel/src/routes/managedAgents.ts:226`, `packages/kernel/src/presence/tracker.ts:56`

---

### BUG-4 — MAJOR: Presence state NOT initialized from REST on browser load; all chips show "offline"
**Severity: MAJOR**

When the browser page loads (or reloads), there is no REST endpoint to fetch the current presence state snapshot. The renderer relies entirely on WebSocket broadcasts for presence updates.

**Impact**: On kernel startup, `reconcile()` broadcasts initial presence states (`hook-not-installed`, `stale`, `pane-dead`) via the WS bus. But these fire BEFORE the browser connects. The browser connects fresh with an empty presence map. All chips render as `"offline"` because:
1. No `GET /presence/snapshot` endpoint exists
2. The presence ticker only broadcasts on STATE CHANGES (emits nothing if state hasn't changed since last tick)
3. No broadcast is issued on new WS client connections

**Evidence**: After kernel restart, all 8 chips showed `data-state="offline"` even for 4 agents with live tmux sessions that should show `hook-not-installed` or `stale`.

**Fix needed**: Add a REST endpoint `GET /managed-agents/presence` that returns the current tracker snapshot, and call it on initial load alongside `GET /managed-agents`.

**Files**: `packages/kernel/src/routes/presence.ts` (missing snapshot route), `packages/renderer/src/App.tsx:138-146` (initial data fetch missing presence)

---

### BUG-5 — MAJOR: Zombie chips — deleted agents persist in UI indefinitely
**Severity: MAJOR**

After `DELETE /managed-agents/:id` (goodbye), the agent chip remains visible in the UI across page reloads. Two separate failures in the chain:

**Backend**: `DELETE` calls `clearManagedSiblings()` which removes `agents/<id>/tmux-session` and `agents/<id>/runtime` files, but does NOT remove the participant from `config.json`. No `deleteParticipant()` function exists anywhere.

**Frontend**: WS `managed-agent.killed` event removes from `managedAgents` and `presence` stores but does NOT call any `removeParticipant()` action (which doesn't exist in the store). `TopBar.tsx` renders a chip for every participant with `kind="agent"` from the participants map, creating a "zombie" chip for the deleted agent.

**Evidence**: 
- After testing, `config.json` contained 6 agent participants (4 still alive + 2 deleted)
- UI showed 8 chips (6 agents + extra from spawning)
- API showed 4 managed agents

**Fix needed**: 
1. Backend: Add `deleteParticipant()` to `participants.ts` and call it in the DELETE route
2. Frontend: Add `removeParticipant()` to store and call it from `dispatchManagedAgentWsMessage` on `managed-agent.killed`

**Files**: `packages/kernel/src/routes/managedAgents.ts:364`, `packages/kernel/src/agents/managed.ts:74-87`, `packages/renderer/src/state/store.ts:241`, `packages/renderer/src/shell/TopBar.tsx:244-284`

---

### BUG-6 — MINOR: "Show last failure" button does nothing (v0.4 stub, no UI feedback)
**Severity: MINOR**

The "Show last failure" button in the agent chip menu is visible, not disabled, but clicking it only calls `console.log("show logs", participant_id)` and closes the menu. No UI feedback is shown to the user.

**Code reference**: `packages/renderer/src/shell/TopBar.tsx:491-497`
```typescript
onShowLogs={() => {
  /* v0.4 stub: opens a future logs viewer. For now log to console */
  console.log("show logs", agent.participant_id);
  setOpenMenuFor(null);
}}
```

---

### BUG-7 — MINOR: "Rename" button does nothing (v0.4 stub, accepts input but discards it)
**Severity: MINOR**

The rename flow in the chip menu presents an input field, accepts text input, and pressing Enter "confirms" it. But the handler is a stub: it calls `console.log("rename", ...)` and closes the menu without making any API call. The input is silently discarded with no feedback.

**Code reference**: `packages/renderer/src/shell/TopBar.tsx:420-427`
```typescript
onRename={(newName) => {
  /* v0.4 stub: update participant name via PATCH;
     intentionally not wired in this task */
  console.log("rename", agent.participant_id, newName);
  setOpenMenuFor(null);
}}
```

---

## Additional findings

### EMFILE crash: Too many chokidar file watchers
When multiple kernel instances run concurrently (e.g. 6+ subagents), the kernel can crash with:
```
Error: EMFILE: too many open files, watch '/tmp/.../sessions'
```
This is triggered by chokidar exhausting `inotify` user instance limits. In this test run the kernel crashed silently 3 times (no log output before crash). Each crash required a manual kernel restart.

### Reconnect button shown for agents with live sessions
When all chips show "offline" (due to BUG-4), the `showReconnect` logic in `AgentActionMenu.tsx:70` shows the Reconnect button for ALL agents (since `state === "offline"`). This is misleading — agents with running tmux sessions that are simply "offline" due to the presence initialization bug appear to need reconnect.

### paneAlive closure set to `() => true` on reconcile as well
Reconcile at line 72 and 117 also hardcodes `{ paneAlive: () => true }`. The `pane-dead` path at line 101 correctly uses `markPaneDead()`, but living agents get a closure that can never detect future death.

## Items not testable

| Item | Reason blocked |
|---|---|
| A.1: Hook fires and pings kernel | BUG-1: hook connects to wrong port (7777 instead of 17910). Would need either `--port 7777` or a workaround. |
| A.1: Chip flips to "online" after first ping | Blocked by BUG-1 (wrong port) and BUG-4 (offline chip) |
| A.5: Kill kernel with kill -9 (verify process death) | Container environment has `CapEff: 0000000000000000`; `kill -9` to processes parented to PID 1 silently fails. SIGTERM works for graceful shutdown. Used alternative: start fresh kernel process from same shell and kill that. |
| A.4: Chip flips to pane-dead within tracker tick | BUG-3: paneAlive closure never returns false during live kernel |
| Chip state "online" under any scenario | Blocked by BUG-4 (no REST presence init) + BUG-1 (hooks route to wrong port) |

## Screenshots
- `/tmp/fmark-A/br-00-initial.png` — initial page load
- `/tmp/fmark-A/br-02-chip-menu.png` — chip menu open
- `/tmp/fmark-A/br-03-after-race.png` — after race-condition spawn tests  
- `/tmp/fmark-A/br-04-after-kill.png` — after tmux kill (chip still "offline")
- `/tmp/fmark-A/chip-02-after-kill.png` — chip 9s after tmux kill (still "offline", never "pane-dead")
- `/tmp/fmark-A/chip-03-after-delete.png` — zombie chip after goodbye + reload
- `/tmp/fmark-A/reconnect-menu.png` — Reconnect button visible for offline agent
- `/tmp/fmark-A/reconnect-modal.png` — Reconnect modal content
- `/tmp/fmark-A/ui-04-chip-menu.png` — full chip menu with all items
- `/tmp/fmark-A/quick-chip.png` — all chips showing "offline"

## Kernel logs
- `/tmp/fmark-A/kernel.log` — first kernel run (received SIGTERM from another agent)
- `/tmp/fmark-A/kernel2.log` — second run
- `/tmp/fmark-A/kernel3.log` — third run (received SIGTERM)
- `/tmp/fmark-A/kernel4.log` — fourth run (stable for final tests)

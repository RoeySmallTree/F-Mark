# 06-security-reconcile.md — Security Gates + Reconcile-on-Restart Findings

**Subagent:** F  
**Port:** 17915–17926 (port conflicts forced incremental allocation)  
**Temp dir:** `/tmp/fmark-F`  
**Date:** 2026-05-23  
**Status:** COMPLETE

---

## Setup

- Build succeeded: all packages compiled clean.
- Kernel tested using `/home/roey/workspace/F-Mark` as project root (existing `.f-mark/` directory).
- A critical environmental issue was encountered: the system had 126/128 inotify instances exhausted from previous test runs by other subagents. This caused `EMFILE: too many open files, watch ...` crashes when attempting to use `/tmp/fmark-F` as a fresh project root with chokidar. All reconcile tests therefore ran against the main project dir.
- Port conflicts accumulated across test sessions (phantom sockets); port numbers were incremented per kernel restart.

---

## F.1 — `--no-auth` without `--allow-process-api-no-auth`

**Result: PASS (all security gates hold)**

| Test | Expected | Actual |
|------|----------|--------|
| `POST /managed-agents/spawn` | 404 with documented error | 404 `{"error":"process-spawning API disabled. Pass --allow-process-api-no-auth to enable under --no-auth."}` |
| `POST /managed-agents/terminal` | 404 with documented error | 404 same error |
| `GET /managed-agents` | 404 with documented error | 404 same error |
| `GET /env-probe` | 200 (read-only, ungated) | 200 with full probe data |
| `GET /guide` | 200 | 200 with guide markdown |

**WS `/ws/pane` finding (minor):** When process API is disabled, `/ws/pane` is NOT registered as a route handler. However, `@fastify/websocket` responds with HTTP 101 to any WebSocket upgrade for unregistered paths — the connection opens and immediately closes (code 1005, no message). No tmux handler is attached, so no pane data can be accessed. This is not an exploitable vulnerability but is technically unexpected: the 101 response could mislead clients into thinking the route exists. The route returns no data and immediately terminates.

**UI behavior:** Not tested via Playwright due to port instability.

---

## F.2 — `--no-auth --allow-process-api-no-auth`

**Result: PASS (dangerous combo works as intended, warnings present)**

### F.2.1 — Banner warning
The startup banner includes the loud warning line:
```
WARNING: --no-auth + --allow-process-api-no-auth allows ANY client on this port to spawn processes.
```
This appears after the standard banner block as an additional warning line.

### F.2.2 — Spawn without any auth
`POST /managed-agents/spawn` succeeds with no cookie, no Authorization header. HTTP 200 + agent spawned. This is expected and documented dangerous behavior.

### F.2.3 — Spawn from evil.example.com origin (no cookie)
`POST /managed-agents/spawn` with `Origin: http://evil.example.com` succeeds. HTTP 200. This is correct: the Origin check only fires when a `fmark_token` cookie is present. Without a cookie (no-auth mode), the origin gate is skipped by design — `if (!hasCookie) return;` in `makeManagedAgentsOriginHook`.

---

## F.3 — Token auth + cookie + Origin

**Result: PASS (all 7 cases correct)**

| Test | Expected | Actual |
|------|----------|--------|
| Cookie + `Origin: http://localhost:17916` | 200 | 200 |
| Cookie + `Origin: http://evil.example.com` | 403 | 403 `{"error":"Origin http://evil.example.com not allowed"}` |
| Cookie + NO Origin header | 403 | 403 `{"error":"cookie-authenticated request missing Origin header"}` |
| Bearer + evil Origin | 200 (bearer bypasses Origin check) | 200 |
| Bearer + wrong token | 401 | 401 `{"error":"unauthorized"}` |
| Cookie + wrong cookie value | 401 | 401 `{"error":"unauthorized"}` |

### F.3.7 — Cookie replay attack
The cookie value IS the password/token itself (not a session-derived nonce). This means:
- Any attacker who observes the cookie can replay it forever.
- There is no session expiry, token rotation, or invalidation mechanism.
- The `Set-Cookie` header uses `SameSite=Strict; HttpOnly` which prevents cross-site theft, but does not prevent replay by an observer on the same machine.

**Assessment:** By design for a local-first developer tool (static password = static token = static cookie). Not a practical vulnerability in the intended threat model (local process), but notable for deployments accessible over SSH tunnels.

---

## F.4 — Confirm-token + DELETE

**Result: PASS (all 8 cases correct)**

| Test | Expected | Actual |
|------|----------|--------|
| GET confirm-token | token returned | `{"token":"3e20d21557c1f8c0"}` |
| DELETE without `?confirm=` | 403 | 403 `{"error":"missing or stale confirm token"}` |
| DELETE with `?confirm=BAD` | 403 | 403 same |
| DELETE with `?confirm=T` | 200 | 200 `{"ok":true}` |
| DELETE again with same T | 403 (consumed) | 403 same — token consumed correctly |
| DELETE after 11s TTL | 403 (expired) | 403 — 10s TTL enforced |
| Race: 2 simultaneous DELETEs | exactly one 200, one 403 | confirmed: one 200, one 403 |

All confirm-token semantics are correct. The CONFIRM_TTL_MS = 10_000 enforces a 10-second window. Token is deleted from the map on first successful consumption.

---

## F.5 — Reconcile-on-restart

**Result: PASS (core durability works)**

1. Spawned 2 agents (claude, codex) + 2 terminals.
2. All 4 corresponding tmux sessions confirmed live: `tmux ls` shows them.
3. Kernel killed with `kill -9`.
4. All 4 tmux sessions survived (detached from process, as expected).
5. Kernel restarted on same project dir.
6. `GET /managed-agents` after restart: all agents returned with `alive: true`, both terminals listed.
7. Reconcile CASE A: both agents with live sessions reconciled successfully.
8. Hook status after reconcile: agents using `claude`/`codex` runtimes without hooks installed are marked `hook-not-installed`. Agents with hooks or non-required hooks are seeded as `stale`.
9. Spawning a new agent after reconcile: succeeds (HTTP 200, new tmux session created).

---

## F.6 — Reconcile with missing `tmux-session` file

**Result: PASS (handled gracefully, with one orphan artifact)**

Steps:
1. Spawned agent A, killed kernel.
2. Manually deleted `.f-mark/agents/<A>/tmux-session`.
3. Restarted kernel.

**Outcome:**
- `listManagedAgentIds` requires the `tmux-session` file to be present (line 96 of `managed.ts`). Without it, the agent directory is skipped entirely.
- The agent is NOT listed in `/managed-agents`.
- The orphaned tmux session (still alive) matches CASE C: kernel killed it on restart.
- **Orphan artifact:** The agent directory's `runtime` file and `log.jsonl` remain on disk after the tmux session is killed. The cleanup only removes `tmux-session` and `runtime` sibling files via `clearManagedSiblings`, but since the `tmux-session` file was already absent, that function was never called. The `log.jsonl` and `runtime` files are left as debris. Not a security issue, but a minor cleanliness concern.

---

## F.7 — Reconcile with OUTSIDER tmux session

**Result: PARTIAL PASS / FINDING**

### Without `@fmark-project` option (manual `tmux new-session`):
- Session `fmark-f-mark-ee7a0c7a-ag-ag-rogue00` created manually without tmux user options.
- After kernel restart: **rogue session was NOT killed and NOT listed.**
- `listFmarkSessions()` cross-checks `@fmark-project` user option against `projectRoot`. Without the option, `val !== projectRoot` → `continue` (skipped).
- **Assessment:** The rogue is invisible — harmless from a data perspective (no agent dir, not listed), but not proactively cleaned up. An attacker cannot inject fake state, but they can create persistent tmux sessions that look like F-Mark sessions without being detected.

### With `@fmark-project` option set manually:
- After setting `tmux set-option -t <rogue> "@fmark-project" "/home/roey/workspace/F-Mark"`, kernel restart killed the rogue (CASE C).
- **Assessment:** The projectRoot-based option check correctly handles the sophisticated attack. Only a process that already has tmux access and knows the exact projectRoot can craft a session that gets reconcile CASE C treatment.

**Finding:** A rogue tmux session that correctly mimics the naming scheme but lacks `@fmark-project` leaks through reconcile. Not a privilege escalation (no agent dir exists), but the session persists indefinitely until manually killed or until the user kills it.

---

## F.8 — Privilege escalation via runtime config

**Result: SECURITY FINDING — CRITICAL**

### Summary
An attacker with write access to `.f-mark/runtimes.json` can achieve arbitrary command execution.

### Attack
1. Added a runtime entry with `"executable": "/bin/sh"` and `"args": ["-c", "echo PWNED > /tmp/fmark-F/pwn.txt"]`.
2. `validateRuntimeEntry` PASSED — `validateExecutable` allows `/bin/sh` (matches `[a-zA-Z0-9_./-]+`), and `validateArgs` only checks that args are strings with no content restrictions.
3. Spawned the malicious runtime via `POST /managed-agents/spawn`.
4. The spawn returned HTTP 500 (tmux `set-option` failed because `/bin/sh -c "..."` exited immediately before the kernel could tag the session), but the command ran in tmux first.
5. `/tmp/fmark-F/pwn.txt` contained `PWNED`.

### Root cause
- `validateExecutable`: allows absolute paths like `/bin/sh`, `/usr/bin/python3`, etc.
- `validateArgs`: no content restrictions on arg strings. `-c` + any shell command is permitted.
- `args` are passed directly to `tmux new-session -- <executable> <args...>`. There is no shell injection because the args are passed as an array (not through a shell), but arbitrary executables with arbitrary args are fully supported.

### Threat model
This is only exploitable if the attacker can write to `.f-mark/runtimes.json`. In the standard local-use case, this requires local filesystem access — equivalent to local code execution already. However, in a shared development environment or container where F-Mark is running under `--no-auth` (or `--no-auth --allow-process-api-no-auth`), any network client that can also write to the project filesystem can escalate to process execution.

The v0.4 spec does not appear to restrict runtime executables to a safe allowlist or prevent absolute paths. This could be considered a known design choice rather than a bug, but should be documented as a trust boundary assumption.

**Cleanup:** `/tmp/fmark-F/pwn.txt` was deleted. `runtimes.json` was restored from backup.

---

## F.9 — Validation gaps

**Result: PASS (no exploitable gaps found)**

| Test | Expected | Actual |
|------|----------|--------|
| `participant_id: "ag-../etc/passwd"` in event POST | 400 unknown participant | 400 `{"error":"unknown participant: ag-../etc/passwd"}` |
| Session ID URL traversal `..%2F..%2Fetc%2Fpasswd` | 404 session not found | 404 — Fastify decodes but sessionExists rejects |
| Session slug `"../evil"` in POST body | 400 path traversal error | 400 `{"error":"slug must not contain path separators or '..': ../evil"}` |
| Session slug with backslash | 400 | 400 `{"error":"slug must not contain path separators or '..': back\\nslash"}` |
| Slash command `"help; rm -rf ~"` | 400 invalid | 400 `{"error":"invalid slash command: help; rm -rf ~"}` |
| Slash command `"../etc/passwd"` | 400 invalid | 400 `{"error":"invalid slash command: ../etc/passwd"}` |
| Message text with ESC (``) | 400 control char | 400 `{"error":"message contains control char at index 4"}` |
| Message text with DEL (``) | 400 control char | 400 `{"error":"message contains control char at index 4"}` |

`assertWithinSession` in `writer.ts` provides an additional defense-in-depth layer using `resolve()` + startsWith check for event file paths. `normalizeSlug` in `sessions.ts` explicitly blocks `..` and `/` and `\`. The ID regex `[a-z0-9-]{2,12}` prevents any special characters in participant IDs.

---

## EMFILE / inotify issue (operational finding)

**Finding:** Starting the kernel in a fresh directory crashes with `EMFILE: too many open files, watch ...` when the system's inotify instance count is exhausted. The system cap is `max_user_instances = 128`. With many parallel test subagents running, this limit was reached.

**Impact:** The kernel exits before the HTTP server starts. There is no error recovery — the unhandled chokidar `error` event causes an uncaught exception and process death. The banner may or may not have been printed before the crash.

**Recommendation:** Either increase `fs.inotify.max_user_instances`, or add a try/catch on the chokidar watcher initialization that gracefully falls back (disabling live-reload) rather than crashing the process.

---

## Summary

| Test | Status | Finding |
|------|--------|---------|
| F.1 — Process API gating under `--no-auth` | PASS | `/ws/pane` returns 101 upgrade even when not registered (benign) |
| F.2 — Dangerous `--no-auth --allow-process-api-no-auth` | PASS | Banner warning present; behavior as documented |
| F.3 — Token + cookie + Origin gate | PASS | All 7 cases correct |
| F.4 — Confirm-token + DELETE | PASS | Consumption, TTL, race all handled correctly |
| F.5 — Reconcile-on-restart | PASS | Agents restored, hooks status seeded correctly |
| F.6 — Missing `tmux-session` file | PASS (minor debris) | Orphan `runtime` + `log.jsonl` files left after deletion |
| F.7 — Outsider tmux session | PARTIAL PASS | Rogue without `@fmark-project` is invisible (not killed) |
| F.8 — runtimes.json privilege escalation | **CRITICAL FINDING** | `/bin/sh` + arbitrary args allowed; PWNED confirmed |
| F.9 — Validation gaps | PASS | No path traversal or injection vectors found |
| Operational | FINDING | EMFILE crash when inotify instances exhausted |

# SubAgent D — Spawn Lifecycle, Race Conditions & Error Paths

**Date:** 2026-05-23  
**Port:** 17913  
**Temp dir:** `/tmp/fmark-D`  
**Kernel:** F-Mark v0.0.1

---

## Summary

9 test sections run. 8 confirmed bugs/issues found, ranging from a `session_id` data-injection gap to a terminal spawn TOCTOU race that causes cascading 500s under concurrency. No kernel crash or process leak observed. Rollback works correctly. Origin enforcement is solid. Confirm-token one-shot is safe (concurrent race handled by in-process Map atomicity). The most actionable items are the unvalidated `session_id`, the terminal TOCTOU race, the 500 error leaking session name internals, the ghost participant problem, and the sporadic "Unexpected end of JSON input" 400 under rapid-fire browser spawns.

---

## D.1 — Rapid + Button Mashing

**Method:** JS `btn.click()` x10 in a single synchronous loop (same tick), then measured network requests and chip count.

**Results:**
- 10 `POST /managed-agents/spawn` requests fired.
- 9 succeeded (HTTP 200), 1 returned HTTP 400 `{"error":"Unexpected end of JSON input"}`.
- 9 new participant IDs were allocated, each unique.
- 9 new chips appeared in the header bar.
- UI did **not** lock up.
- The menu closed after the first click (correct), but all 10 clicks were already dispatched before the closure event propagated — so all 10 requests fired.

**Bug D1-A: Sporadic "Unexpected end of JSON input" 400 under browser rapid-fire**  
One of 10 identical-body requests received a 400 with `{"error":"Unexpected end of JSON input"}` from the server. The request body was valid JSON (`{"runtime_id":"claude"}`). The same pattern appeared in earlier shell tests with >5 concurrent shell spawns. Node-to-Node concurrent HTTP tests (50 batches × 10) did NOT reproduce it. This appears timing-dependent and specific to HTTP/1.1 pipelining or connection reuse behavior from the browser's fetch API. The kernel appears to occasionally receive a truncated body under peak same-tick concurrency.

**Severity:** Medium — any rapid UI interaction (double-click, keyboard shortcut held down) can silently fail one spawn per burst.

---

## D.2 — Invalid Spawn Payloads

All tests used `curl` with `Cookie: fmark_token=fmark-D` + `Origin: http://localhost:17913`.

| # | Payload | HTTP | Response |
|---|---------|------|----------|
| D2.1 | `{"runtime_id":"claude"}` | 200 | OK — spawned correctly |
| D2.2 | `{"runtime_id":"nonexistent"}` | 400 | `{"error":"unknown runtime_id: nonexistent"}` |
| D2.3 | `{"runtime_id":""}` | 400 | `{"error":"runtime_id required"}` |
| D2.4 | `{"runtime_id":null}` | 400 | `{"error":"runtime_id required"}` |
| D2.5 | `{"runtime_id":"../etc/passwd"}` | 400 | `{"error":"unknown runtime_id: ../etc/passwd"}` |
| D2.6 | `{"suggested_participant_id":"BAD@FORMAT"}` | 400 | `{"error":"invalid participant_id"}` |
| D2.7 | `suggested_participant_id: "ag-" + "x"×200` | 400 | `{"error":"invalid participant_id"}` |
| D2.8 | `{"session_id":"../../../etc/passwd"}` | **200** | Spawned — value stored verbatim |
| missing CT | Body without `Content-Type` | 415 | `{"statusCode":415,...,"message":"Unsupported Media Type"}` |
| no body | No body | 400 | `{"error":"runtime_id required"}` |

**Bug D2-A: `session_id` stored without validation**  
`session_id` in the spawn payload is written verbatim to `.f-mark/agents/<id>/active-session` with no format validation. The path construction is safe (participant ID determines the path, not `session_id`), but:
- The file content `../../../etc/passwd` was confirmed stored.
- This value later propagates to `readActiveSession()` which feeds it to `sessionExists()` — returning `false` safely. However it also appears in kickoff text sent to the runtime: `Welcome — you are participant ag-…, session ../../../etc/passwd`. An attacker controlling the spawn body can inject arbitrary text into the agent's first message.
- The dedicated `/agents/:id/link` endpoint correctly validates session existence before writing. The spawn route bypasses this check.

**Severity:** Low-Medium — no filesystem escape; but arbitrary text injection into agent kickoff message.

---

## D.3 — Spawn Rollback

**Test:** `chmod 555 .f-mark/agents/`, then spawn.

**Test A — mkdir fails (agents dir read-only):**
- Server returned HTTP 500: `EACCES: permission denied, mkdir '/tmp/fmark-D/.f-mark/agents/ag-claude-XXXX'`
- `writeTmuxSession` is called AFTER `tmux.spawnAgent()`, so a tmux session WAS created before the EACCES.
- The rollback code (`tmux.killSession`) executed — no orphan session remained. **Rollback worked correctly.**

**Test B — file write fails (dir exists, write blocked):**
- Same result: rollback killed the tmux session cleanly.

**Bug D3-A: `registerAgent` config write is NOT rolled back**  
The spawn flow is: `registerAgent` (writes `config.json`) → `tmux.spawnAgent` → `writeTmuxSession` (writes agent dir). If `writeTmuxSession` fails, the tmux session is rolled back — but `config.json` retains the participant entry. These "ghost participants" are invisible in the `/managed-agents` API (which reads agent dirs, not config), but they persist in `config.json` and consume color slots.

Confirmed ghost participants after test: `ag-claude-d1c6`, `ag-claude-7fe7`, `ag-test-rr01` — all in config but absent from agent dirs.

**Severity:** Low — no user-visible impact immediately; color palette exhausts over time with enough failures; `config.json` grows indefinitely.

---

## D.4 — Confirm-Token Edge Cases

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| GET confirm-token, wait 11s, DELETE | 403 stale | 403 `missing or stale confirm token` | PASS |
| DELETE with `confirm=garbage` | 403 | 403 | PASS |
| DELETE without `confirm` | 403 | 403 | PASS |
| Valid token used TWICE | second=403 | first=200, second=403 | PASS |
| DELETE for nonexistent ID with fake token | 403 (no token) | 403 | PASS |
| GET confirm-token for nonexistent participant | 400? | **200** + valid token | BUG |
| DELETE nonexistent ID with its valid token | 404? | **200 ok=true** | BUG |

**Bug D4-A: confirm-token is minted for any valid-format ID without existence check**  
`GET /managed-agents/ag-nonexistent/confirm-token` returns HTTP 200 with a real token even if `ag-nonexistent` was never registered. The subsequent DELETE also returns 200 and writes a `goodbye` log entry in `.f-mark/agents/ag-nonexistent/log.jsonl`. This creates a stray log directory for agents that never existed.

**Severity:** Low — can create stray directories; not a privilege escalation.

**Bug D4-B: Second `GET /confirm-token` silently invalidates the first**  
`mintConfirm()` overwrites the Map entry for the same ID. If a UI race or double-click triggers two confirm-token fetches for the same agent, only the second is valid. The first caller's token silently fails when used. No error is sent to the first caller.

**Severity:** Low — UI impact only; no security implication since both tokens were legitimately issued.

---

## D.5 — Origin/Host Enforcement

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| POST with `Origin: http://evil.example.com` | 403 | 403 `Origin http://evil.example.com not allowed` | PASS |
| POST with no Origin header | 403 | 403 `cookie-authenticated request missing Origin header` | PASS |
| POST with `Origin: http://localhost:17913` | 200 | 200 | PASS |
| POST with `Origin: http://127.0.0.1:17913` | 200 | 200 | PASS |
| POST with malformed Origin `not-a-url` | 403 | 403 `invalid Origin header: not-a-url` | PASS |
| GET with evil origin | 200 (GET exempt) | 200 | PASS |
| POST with Bearer token + evil origin | 200 (bearer exempt) | 200 | PASS (by design) |
| POST with no auth at all | 401 | 401 | PASS |
| POST with wrong cookie value | 401 | 401 | PASS |

Origin enforcement is **correct** across all tested scenarios.

---

## D.6 — Concurrency / Race

**Test D6.1: Two simultaneous spawns with same `suggested_participant_id`**

Both requests raced through `registerAgent` — the participant was registered in `config.json` once (no double-write due to read-then-write pattern). The first request won `tmux.spawnAgent`; the second got:

```
HTTP 500: {"statusCode":500,"error":"Internal Server Error",
           "message":"tmux new-session failed: duplicate session: fmark-fmark-d-29dec823-ag-ag-race-test1"}
```

**Bug D6-A: 500 response leaks internal session name format**  
The error message from tmux is propagated verbatim to the client, revealing the full internal session naming convention: `fmark-<project-slug>-<hash>-ag-<participant_id>`. This exposes internal path structure and project directory hash to any authenticated caller.

**Severity:** Low-Medium — information leak; session names are project-specific but not secret.

**Test D6.2: Two simultaneous DELETEs with same confirm token**

Node's in-process Map operations are synchronous, so the first DELETE consumed the token atomically before the second could read it. Result: first=200, second=403. **No race condition in the delete path.**

**Test D6.3: Two sequential `GET /confirm-token` + simultaneous DELETE**

Second `GET /confirm-token` overwrote first token. First DELETE with old token got 403; second DELETE with new token got 200. Expected behavior given Map semantics.

---

## D.7 — Resource Leaks

**50 concurrent terminal spawns:**
- All 50 requests fired simultaneously.
- All 50 read `maxIdx` before any could write — all computed `index=1` (TOCTOU).
- 1 succeeded (first tmux new-session winner), 49 failed with HTTP 500 `duplicate session: fmark-fmark-d-...-term-1`.

**Bug D7-A: Terminal spawn TOCTOU race — 49/50 concurrent spawns fail with HTTP 500**  
`POST /managed-agents/terminal` reads `listFmarkSessions()` to compute the next index, then calls `tmux.spawnAgent`. Under concurrency, all N requests read the same `maxIdx`, all compute the same `index`, and all try to create the same session name. One wins; the rest return HTTP 500 leaking the session name. There is no mutex or retry.

**Severity:** Medium — under any UI-level double-click or rapid terminal creation, most requests fail with 500. Error message leaks session name (same as D6-A).

**Memory after ~134 agents spawned:** RSS 138 MB (acceptable).

**Disk after tests:** 476 KB total for `.f-mark/` with 30+ agent directories.

**tmux kill-session then kernel poll:** Kernel survived session kill gracefully; dead sessions correctly reflected as `alive: false` in the next `/managed-agents` GET.

---

## D.8 — Bad WebSocket Usage

| Test | Expected | Actual | Pass? |
|------|----------|--------|-------|
| Connect to `/ws/pane` without `?session=` | 1008 | 1008 `session query param required` | PASS |
| Connect with `?session=nonexistent` | error | 1011 `snapshot failed` + `pane.error` sent first | PASS |
| Malformed JSON sent to connected pane | server ignores, no crash | silently ignored (`try/catch { return }`) | PASS |
| `{type:"pane.input", data:"\x1b[A"}` (ESC) | error (control char < 0x20) | `pane.error: message contains control char at index 0` | PASS |
| `{type:"pane.input", data:"\x00\x00\x00"}` | error | `pane.error: message contains control char at index 0` | PASS |
| `{type:"pane.key", key:"; echo INJECTED"}` | passed through | passed through (tmux literal key, not shell) | PASS — not shell injection |
| `{type:"pane.key", key:"\x00"}` | ? | **no error, no validation** | BUG (see below) |

**Bug D8-A: `pane.key` has no input validation**  
`pane.input` is validated by `validateMessageText()` which rejects control characters (< 0x20 except tab, and 0x7f). `pane.key`, however, passes the key string directly to `tmux send-keys` without ANY validation. Null bytes and arbitrary binary strings are accepted. While `send-keys` is not a shell injection vector (it goes through `execv`, not `/bin/sh`), unvalidated key strings could trigger unexpected tmux behavior or crash the tmux session.

`pane.input` also correctly blocks ESC sequences (0x1B) since ESC < 0x20. This is deliberate and correct.

**Severity:** Low — no shell injection; but null bytes or tmux-key special sequences could disrupt the session.

---

## Summary Table

| ID | Section | Severity | Title |
|----|---------|----------|-------|
| D1-A | D.1 | Medium | Sporadic 400 "Unexpected end of JSON input" under rapid-fire browser spawns |
| D2-A | D.2 | Low-Med | `session_id` in spawn body stored without format validation; arbitrary text reaches agent kickoff |
| D3-A | D.3 | Low | Ghost participants left in `config.json` when spawn fails after `registerAgent` but before agent dir write |
| D4-A | D.4 | Low | `GET /confirm-token` succeeds for nonexistent agents; `DELETE` returns 200 + writes stray log |
| D4-B | D.4 | Low | Second `GET /confirm-token` silently invalidates first token for same agent |
| D6-A | D.6 | Low-Med | 500 errors on concurrent spawn / terminal creation leak internal tmux session name format |
| D7-A | D.7 | Medium | Terminal spawn TOCTOU: 10 concurrent `POST /managed-agents/terminal` → 1 succeeds, 9 fail with 500 |
| D8-A | D.8 | Low | `pane.key` WS message type accepts arbitrary strings including null bytes; no validation |

**Confirmed-working (no bugs):**
- Spawn rollback (tmux session killed on post-spawn write failure)
- Origin/Host enforcement (all attack vectors blocked)
- Confirm-token one-shot enforcement (concurrent deletes handled correctly)
- `pane.input` ESC/control-char rejection
- Malformed WebSocket JSON is silently dropped (no crash)
- Auth gates (401 for no/wrong token, 403 for wrong Origin)

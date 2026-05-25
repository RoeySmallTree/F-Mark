# Review: v0.4 browser smoke checklist

Status: REVISE

The checklist is a good skeleton, and Section K is pointed at the right user-visible failure. I would not use it as the final release gate yet. As written, it can still produce a fake all-green because too many items say "works" without a required artifact, several v0.4 API/WS contracts are not exercised, and the tmux/runtime prerequisites are not explicitly gated.

The most important revision: every PASS needs one of these evidence types recorded inline: Playwright assertion, network record, WS frame, screenshot path, tmux command output, filesystem proof under `.f-mark`, or kernel log excerpt. If the item cannot produce evidence, it should be rewritten or removed.

## High-priority gaps

1. **Missing API contract section.**
   The spec defines more than the visible click flows: `GET /managed-agents`, `GET /managed-agents/:id/logs`, `GET /managed-agents/:id/confirm-token`, `POST /agents/:id/ping`, `GET /managed-agents/hook-install-status`, `POST /managed-agents/hook-install-instructions`, `/env-probe`, `/env-probe/refresh`, and `/guide` aliases. The checklist touches some through UI, but it does not require direct browser-context verification of status, content-type, JSON shape, and auth behavior.

2. **Section K needs stricter reproduction criteria.**
   K captures URL/headers/body, which is good, but it does not require:
   - Full request body: `runtime_id: "claude"` and current `session_id`.
   - Same-origin URL, not Vite/dev proxy and not a stale base URL.
   - Auth path: `Authorization: Bearer fmark-test` or cookie auth plus valid `Origin`.
   - Response `Content-Type` starts with `application/json`.
   - Body parses as JSON and contains `participant_id`, `tmux_session`, `runtime_id`, `hooks_status`.
   - Browser console has no `Unexpected token '<'`, unhandled rejection, or "spawn failed".
   - UI outcome appears after network success: chip plus hook modal or installed-hook path.

3. **Static-fallback / HTML-response class is not broadly tested.**
   The reported bug is likely an API route falling through to static `index.html`. K checks `/managed-agents/spawn`, but the same class should be checked for every new API and WS endpoint. Add negative assertions that 401/403/404/409/400 responses from new routes are JSON, not HTML.

4. **Real tmux gating is too implicit.**
   Items C4-C14, D4-D14, F, G5, H, I, and J2 require real tmux. C12/C13/N also require the relevant runtime on PATH unless a deterministic shim is used. The checklist must state: if `tmux -V` is missing or `<3.0`, mark real-tmux sections BLOCKED, not PASS. If `claude`, `codex`, or `gemini` are missing and no shim is installed, mark that runtime's spawn flow BLOCKED.

5. **Runtime registry mismatch with the spec.**
   Section L says Save/Edit/Remove are read-only in v0.4. The v0.4 spec says Manage Runtimes includes add/edit/remove/custom runtimes and separate executable/args fields. Either update the spec to say runtime CRUD is deferred, or add browser/API tests for custom runtime add/edit/remove and a custom executable shim. Do not let the checklist silently redefine v0.4 scope.

6. **WS message coverage is incomplete.**
   The checklist covers visible terminal streaming and fan-out, but not the complete `/ws/pane` contract: `pane.snapshot`, `pane.data`, `pane.input`, `pane.key`, `pane.resize`, error frames, missing `session`, auth via `?token`, close behavior, and "one pipe per pane". The global `/ws` v0.4 messages also need checks: `presence`, `managed-agent.spawned`, `managed-agent.killed`, `managed-agent.terminal-spawned`, and `env-probe.updated`.

7. **Negative tests are too shallow.**
   Add explicit checks for unknown runtime id, invalid suggested participant id, unmanaged `/command` 409, invalid slash command 400, message control chars 400, missing/expired/reused confirm token, wrong token, missing auth, cookie auth with allowed origin, cookie auth with foreign origin, cookie auth with no origin, and process API disabled under `--no-auth` for both `/managed-agents/*` and `/ws/pane`.

## Per-section additions

### Setup

- Start from a real fresh temp project, not the repo root:
  - record temp project path;
  - record `HOME` if hook config is isolated;
  - record kernel stdout/stderr path;
  - record exact printed URL.
- Require built static renderer only. Do not use Vite dev server or mocked fetch.
- Add a first network sanity sweep from Playwright's `page.request`, not curl only:
  - `GET /health` -> JSON 200.
  - `GET /sessions` -> JSON 200 with auth.
  - `GET /managed-agents` -> JSON 200 in default token mode.
  - `GET /env-probe` -> JSON 200.
- Add artifact list: `screenshots/setup-shell.png`, `network.har` or JSON network dump, `kernel.log`.

### A. Sanity and state

- Add close-path checks for Settings and CmdK: X button, Escape, backdrop where applicable.
- Add keyboard navigation: open CmdK with keyboard, open settings via button, tab focus is not trapped behind the modal.
- Add chip-strip overflow/scroll test after several chips exist.
- Add screenshot after first load and after each modal opens.

### B. Env probe

- B3 should assert `POST /env-probe/refresh`, not just "fresh fetch", and capture the `env-probe.updated` global WS frame.
- Add direct response shape checks: `tmux`, `tmuxVersion`, `runtimes`, `installer`, `os`.
- Add "no install route" negative: `POST /env/install` must not exist and must not execute anything.
- If the local environment cannot simulate missing tmux or old tmux, mark those variants BLOCKED and keep unit tests as separate evidence. Do not infer the banner from a machine where tmux is already good.

### C. Plus button and spawn

- Add menu close tests: Escape, outside click, selecting item closes once.
- Add keyboard activation for the menu items.
- For C4/C5, require the complete network record:
  - method `POST`;
  - path `/managed-agents/spawn`;
  - request JSON body;
  - status;
  - content-type;
  - parsed JSON;
  - first 500 bytes on parse failure.
- On success, verify kernel side effects:
  - `.f-mark/agents/<id>/tmux-session` exists and matches response;
  - `.f-mark/agents/<id>/runtime` exists;
  - `.f-mark/agents/<id>/active-session` is written when a session is selected;
  - `log.jsonl` contains `spawn`;
  - `tmux show-options -t <tmux_session> -v @fmark-project`;
  - `tmux show-options -t <tmux_session> -v @fmark-participant`.
- Split the hook branches:
  - hooks missing -> hook modal opens and `POST /managed-agents/hook-install-instructions?...` is captured.
  - hooks installed -> no hook modal, kickoff text is sent into the pane after `readyDelayMs`.
- C12/C13 should be per-runtime rows with PASS/FAIL/BLOCKED. If runtime not on PATH and no shim is used, the correct result is BLOCKED for spawn, PASS for disabled-menu behavior.
- C14 terminal spawn should also capture `managed-agent.terminal-spawned` on `/ws` and verify `GET /managed-agents` includes the terminal.
- C15 should assert the Settings modal actually opens on the Runtimes section, not just any settings view.

### D. Managed AgentChip menu

- D3 must be unambiguous. The spec says Rename works. If implementation stubs it, this is FAIL unless the spec is revised.
- D4/D6/D7/D9 should verify both HTTP and tmux side effect. Use a deterministic runtime shim that echoes received lines, then assert `tmux capture-pane` contains `/compact`, `/clear`, `/resume`, and the message.
- Add command-route negative cases:
  - `{type:"slash", command:"bad command"}` -> 400 JSON.
  - `{type:"message", text:"bad\u0001"}` -> 400 JSON.
  - `{type:"bogus"}` -> 400 JSON.
  - unmanaged participant -> 409 `{ reason: "unmanaged_pane" }`.
- D13 should verify confirm-token semantics, not just "flow":
  - `GET /managed-agents/:id/confirm-token` returns JSON token;
  - DELETE without token -> 403 JSON;
  - DELETE with token -> 200 JSON;
  - reusing same token -> 403 JSON;
  - expired token -> 403 JSON, if the test can wait 10s.
- D12 should require `GET /managed-agents/:id/logs?since=20` and an actual rendered log view. If logs are a stub, mark FAIL or update scope.

### E. Unmanaged AgentChip menu

- Add a direct API check that `/managed-agents/:id/command` on the unmanaged participant returns 409 JSON.
- Reconnect modal should capture `GET /guide?agent_id=...&session_id=...&runtime_id=...`.
- Verify guide markdown contains:
  - the agent participant id;
  - the current session id;
  - runtime-specific hook/manual-stream section;
  - no "NOT YET SHIPPED" text.
- Add copy-button evidence for Reconnect modal.

### F. Terminal chips and overlay

- Add WS frame capture:
  - first message is `pane.snapshot`;
  - typing text emits `pane.input`;
  - Enter emits `pane.key` with the expected key name;
  - resize emits `pane.resize`;
  - stream output arrives as `pane.data`.
- Add close-path checks: Detach, X, backdrop, Escape if intended.
- Add resize verification with Playwright viewport change plus `pane.resize` frame.
- Add invalid pane checks:
  - `/ws/pane` without `session` closes with policy/error;
  - invalid session produces `pane.error` and closes.
- F6 assumes a terminal kill menu exists. If the UI only opens the overlay, this should fail or become a new required Terminal Action Menu section.
- The spec calls for a tab strip in Terminal Overlay. Add "switch between two open panes without closing overlay" or explicitly defer it.

### G. Presence dynamics

- Replace the 10-minute manual wait with either:
  - a test-only shortened TTL mode, or
  - mark G3/G4 BLOCKED in browser smoke and rely on unit tests for timing.
- Add direct `POST /agents/:id/ping` verification: status 204, `presence` WS frame, dot turns green.
- Verify hook-not-installed -> online transition by starting missing, then firing ping.
- For pane-dead, kill the tmux session directly and wait for tracker tick; capture `presence` frame and screenshot.
- Add `launching` state check immediately after spawn if observable.

### H. Pane WS fan-out

- Add assertion that two browser tabs receive independent `pane.snapshot` frames.
- Verify only one tmux pipe is active for the pane. If direct tmux introspection is flaky, require kernel log evidence from `ws.pane` start/stop.
- Add "close last tab stops pipe; reopening re-snapshots" test.
- Add "output while no subscribers is not buffered except via new capture-pane snapshot" check if practical.

### I. Reconcile on restart

- Add all spec cases, not only happy survival:
  - live managed agent with hooks installed -> stale until ping;
  - live managed agent with hooks missing -> hook-not-installed;
  - agent dir exists but tmux session is gone -> sibling files cleared, `active-session` kept, `pane-died` log entry, pane-dead state;
  - tmux agent session exists with no agent dir -> orphan is killed;
  - terminal session survives;
  - session from another project root is ignored.
- Verify `@fmark-project` and `@fmark-participant` user options after restart.
- Include same-basename/different-root collision test if feasible because the spec explicitly uses path hash to prevent that class.

### J. Security gates

- Add auth matrix:
  - no auth -> 401 JSON;
  - wrong bearer -> 401 JSON;
  - correct bearer -> mutating route works without Origin;
  - `?token=` sets cookie;
  - reload without query token uses cookie;
  - cookie plus same-origin `Origin` works;
  - cookie plus foreign `Origin` fails 403 JSON;
  - cookie with missing `Origin` fails 403 JSON.
- Add process-API-disabled matrix under `--no-auth`:
  - `/managed-agents/spawn` -> 404 JSON;
  - `/managed-agents/terminal` -> 404 JSON;
  - `/managed-agents/:id/command` -> 404 JSON;
  - `/ws/pane?...` does not serve HTML and does not accept pane input.
- Add `--no-auth --allow-process-api-no-auth` warning screenshot and route success, gated on tmux/runtime availability.
- Add confirm-token single-use and expiry as noted in D.
- Add shell-injection-ish negatives:
  - unknown `runtime_id` -> 400 JSON;
  - invalid `suggested_participant_id` -> 400 JSON;
  - slash command with spaces -> 400 JSON;
  - message with control char -> 400 JSON.

### K. Reported HTML response bug

Keep this section, but make it a hard release blocker. Suggested replacement:

- K1 Start kernel in default token mode from a fresh temp project, built static renderer, no Vite, no `--no-auth`, no `--allow-process-api-no-auth`.
- K2 Open the exact printed URL with `?token=fmark-test`; keep the same browser context for the click.
- K3 Capture all requests/responses from first page load through `+ -> Claude`; save HAR or JSON.
- K4 Assert the spawn request is:
  - same origin as page;
  - `POST /managed-agents/spawn`;
  - request `content-type: application/json`;
  - body has `runtime_id: "claude"` and selected `session_id`;
  - carries bearer auth or a valid cookie auth path.
- K5 Assert response is:
  - status 200, or if runtime/tmux missing, an expected JSON error that explains the environment;
  - `content-type: application/json`;
  - parseable JSON;
  - does not start with `<!doctype` and does not contain the static app shell.
- K6 Assert UI behavior:
  - no console parse error;
  - no unhandled promise rejection;
  - agent chip appears or a specific JSON error is surfaced;
  - screenshot after click is attached.
- K7 If failure occurs, paste kernel log lines for that request plus first 500 response bytes.

### L. Settings panels

- Resolve runtime CRUD scope mismatch first. If spec remains authoritative, add Add/Edit/Remove custom runtime tests and verify `.f-mark/runtimes.json`.
- For read-only implementation, L2 should be "FAIL against spec" unless scope has officially changed.
- Hook Status should verify actual `GET /managed-agents/hook-install-status` requests and returned entries for Claude/Codex/Gemini.
- Env Probe panel should verify `POST /env-probe/refresh` and `env-probe.updated` WS.
- Add settings nav keyboard/focus/close checks.

### M. Top bar non-regressions

- M1 should assert the `POST /sessions/:id/events/prose` network request and that feed updates without reload.
- M2 should verify `event_added` on `/ws`, then reload and confirm persistence.
- M3 should include screenshot or visible-count assertion per view.
- M4 should record before/after theme class or local storage.
- M5 should assert agent participants do not render in the right participants stack, while user participants still do.

### N. v0.3.0 hook path regression

- Add a no-real-Claude fallback using `f-mark hook auto-stream` with a fixture transcript so this is not BLOCKED on Claude availability.
- Verify both assistant and user hook modes:
  - assistant Stop posts as agent id;
  - UserPromptSubmit posts as user id with `--kind user`.
- Capture `/agents/:id/ping` response 204 and the `presence` WS frame.
- Verify `active-session` contract is unchanged.

## New sections needed

### O. Browser API Contract Matrix

Run these from Playwright `page.request` in the same browser context used by the UI. For every endpoint, record status, content-type, and parsed body or first 500 bytes.

- `GET /managed-agents`
- `POST /managed-agents/spawn`
- `POST /managed-agents/terminal`
- `GET /managed-agents/:id/confirm-token`
- `DELETE /managed-agents/:id?confirm=...`
- `GET /managed-agents/:id/logs?since=20`
- `POST /managed-agents/:id/command`
- `POST /agents/:id/ping`
- `GET /managed-agents/hook-install-status?...`
- `POST /managed-agents/hook-install-instructions?...`
- `GET /env-probe`
- `POST /env-probe/refresh`
- `GET /guide?agent_id=...&session_id=...&runtime_id=...`
- `GET /guide?agent_id=...&sessionId=...&runtime_id=...` alias

### P. WebSocket Contract Matrix

- `/ws` receives:
  - `event_added`;
  - `event_superseded`;
  - `presence`;
  - `managed-agent.spawned`;
  - `managed-agent.killed`;
  - `managed-agent.terminal-spawned`;
  - `env-probe.updated`.
- `/ws/pane?session=...&token=...` receives/sends:
  - `pane.snapshot`;
  - `pane.data`;
  - `pane.input`;
  - `pane.key`;
  - `pane.resize`;
  - `pane.error` or close on invalid session.

### Q. Runtime Registry Scope

Either:

- add tests for `.f-mark/runtimes.json` custom runtime, separate `executable` and `args[]`, safe validation, and custom runtime appearing in `+` menu and settings; or
- explicitly mark runtime CRUD deferred and link to the spec change.

### R. Artifact Checklist

Each section should name the artifacts it must leave behind:

- screenshot path;
- network dump/HAR path;
- WS frame log path;
- kernel log excerpt;
- tmux command output;
- `.f-mark` file evidence;
- exact PASS/FAIL/BLOCKED note.

## Recommended commands and probes

### Deterministic temp project and runtime shims

Use shims for browser smoke unless the goal is specifically to test real Claude/Codex/Gemini behavior. This keeps the tmux path real while making the runtime predictable.

```bash
ROOT=/home/roey/workspace/F-Mark
TMP=$(mktemp -d)
mkdir -p "$TMP/project" "$TMP/home" "$TMP/bin"

cat > "$TMP/bin/fmark-runtime-shim" <<'SH'
#!/usr/bin/env bash
echo "fmark runtime shim ready: $0"
trap 'echo "RX:INTERRUPT"' INT
while IFS= read -r line; do
  printf 'RX:%s\n' "$line"
done
SH
chmod +x "$TMP/bin/fmark-runtime-shim"
ln -s "$TMP/bin/fmark-runtime-shim" "$TMP/bin/claude"
ln -s "$TMP/bin/fmark-runtime-shim" "$TMP/bin/codex"
ln -s "$TMP/bin/fmark-runtime-shim" "$TMP/bin/gemini"

cd "$TMP/project"
HOME="$TMP/home" PATH="$TMP/bin:$PATH" \
  node "$ROOT/packages/kernel/bin/f-mark.js" --port 17900 --password fmark-test \
  > "$TMP/kernel.log" 2>&1 &
KERNEL_PID=$!
```

### tmux evidence after spawn

```bash
tmux ls | grep '^fmark-'
tmux show-options -t "$TMUX_SESSION" -v @fmark-project
tmux show-options -t "$TMUX_SESSION" -v @fmark-participant
tmux capture-pane -t "$TMUX_SESSION" -p -e -J -S -200
cat ".f-mark/agents/$PARTICIPANT_ID/tmux-session"
cat ".f-mark/agents/$PARTICIPANT_ID/runtime"
cat ".f-mark/agents/$PARTICIPANT_ID/active-session"
tail -n 20 ".f-mark/agents/$PARTICIPANT_ID/log.jsonl"
```

### API response must be JSON, not HTML

```bash
curl -i -H 'Authorization: Bearer fmark-test' \
  http://127.0.0.1:17900/managed-agents

curl -i -H 'Authorization: Bearer fmark-test' \
  -H 'Content-Type: application/json' \
  -d '{"runtime_id":"claude","session_id":"REPLACE_SESSION"}' \
  http://127.0.0.1:17900/managed-agents/spawn
```

For the user bug class, the important assertion is not only "status is not 404"; it is: `Content-Type` is JSON, `JSON.parse` succeeds, and the first bytes are not `<!doctype`.

### Cookie/auth edge probes

```bash
curl -i -c "$TMP/cookies.txt" \
  'http://127.0.0.1:17900/sessions?token=fmark-test'

curl -i -b "$TMP/cookies.txt" \
  -H 'Origin: http://127.0.0.1:17900' \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke terminal"}' \
  http://127.0.0.1:17900/managed-agents/terminal

curl -i -b "$TMP/cookies.txt" \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  -d '{"name":"evil"}' \
  http://127.0.0.1:17900/managed-agents/terminal

curl -i -b "$TMP/cookies.txt" \
  -H 'Content-Type: application/json' \
  -d '{"name":"missing-origin"}' \
  http://127.0.0.1:17900/managed-agents/terminal
```

### Confirm token semantics

```bash
TOKEN=$(curl -s -H 'Authorization: Bearer fmark-test' \
  "http://127.0.0.1:17900/managed-agents/$PARTICIPANT_ID/confirm-token" |
  node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).token))')

curl -i -X DELETE -H 'Authorization: Bearer fmark-test' \
  "http://127.0.0.1:17900/managed-agents/$PARTICIPANT_ID"

curl -i -X DELETE -H 'Authorization: Bearer fmark-test' \
  "http://127.0.0.1:17900/managed-agents/$PARTICIPANT_ID?confirm=$TOKEN"

curl -i -X DELETE -H 'Authorization: Bearer fmark-test' \
  "http://127.0.0.1:17900/managed-agents/$PARTICIPANT_ID?confirm=$TOKEN"
```

### Command and input queue proof

```bash
curl -i -H 'Authorization: Bearer fmark-test' \
  -H 'Content-Type: application/json' \
  -d '{"type":"message","text":"hello from smoke"}' \
  "http://127.0.0.1:17900/managed-agents/$PARTICIPANT_ID/command"

curl -i -H 'Authorization: Bearer fmark-test' \
  -H 'Content-Type: application/json' \
  -d '{"type":"slash","command":"compact"}' \
  "http://127.0.0.1:17900/managed-agents/$PARTICIPANT_ID/command"

tmux capture-pane -t "$TMUX_SESSION" -p -e -J -S -200 | grep -E 'RX:(hello from smoke|/compact)'
```

### Playwright capture pattern for Section K

```ts
const records: Array<Record<string, unknown>> = [];

page.on("console", (msg) => {
  records.push({ kind: "console", type: msg.type(), text: msg.text() });
});
page.on("pageerror", (err) => {
  records.push({ kind: "pageerror", message: err.message });
});
page.on("request", (req) => {
  if (req.url().includes("/managed-agents/spawn")) {
    records.push({
      kind: "request",
      method: req.method(),
      url: req.url(),
      headers: req.headers(),
      postData: req.postData(),
    });
  }
});
page.on("response", async (res) => {
  if (res.url().includes("/managed-agents/spawn")) {
    const body = await res.text().catch((e) => String(e));
    records.push({
      kind: "response",
      url: res.url(),
      status: res.status(),
      headers: res.headers(),
      bodyStart: body.slice(0, 500),
    });
    JSON.parse(body);
  }
});
```

Do not mock or intercept the spawn fetch for this test. Passive capture only.

## Bottom line

Revise before running. The checklist is close enough to keep, but it needs explicit evidence requirements, a direct API/WS matrix, stronger auth negatives, stricter K assertions, and real-tmux/runtime gating. Without those changes it can still miss exactly the kind of "HTML instead of JSON" bug that prompted this review.

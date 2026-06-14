# F-Mark Phase 1/2 Manual Hot-Test Findings

Date: 2026-05-25
Repo: `/home/roey/workspace/F-Mark`
Status: partial; stopped at user request.

Constraint status: I did not edit production code or tests. This report is the only intended repo write. All exercised projects/config roots were under `/tmp`. Completed harnesses removed their temp dirs; the OOM-aborted harnesses may have left isolated `/tmp/fmark-phase12-*` dirs because the Node process died before cleanup.

## Summary

Partial result: mostly PASS for the independently exercised Phase 1/2 behavior, with one clear discrepancy in the hot-test method:

- PASS: route-injected current kernel can create sessions in temp projects.
- PASS: `POST /agents/:id/link` writes active-session state in multi-path mode.
- PASS: `GET /participants` surfaces `active_session` from global project agent state.
- PASS: switching active path isolates participants/agent state between project A and project B.
- PASS: `GET /sessions?scope=all` returns sessions from both known paths with path ids.
- PASS: `runAutoStream` resolves an agent active session from global project state when the legacy `.f-mark/agents/.../active-session` file is absent.
- PASS: `POST /managed-agents/spawn` works with a harmless fake runtime (`true`) and fake tmux `CommandRunner`, writes managed-agent state, and lists the agent alive.
- DISCREPANCY: when I stubbed `globalThis.fetch` to route `runAutoStream` posts back through `app.inject`, Node repeatedly OOMed. Direct event route injection passed, and stubbed fetch without app injection passed. This looks like a harness/runtime interaction around `fetch` + `app.inject`, not proven product behavior.

## Commands Run

Read-only orientation:

```sh
pwd && rg --files | head -200
git status --short
ls -la
find planning -maxdepth 3 -type f | sort
sed -n '1,220p' package.json
sed -n '1,240p' packages/kernel/package.json
sed -n '1,260p' packages/kernel/src/server.ts
sed -n '1,240p' packages/kernel/src/index.ts
sed -n '1,240p' planning/mcp/research-agent-state-hot-tests.md
sed -n '220,520p' packages/kernel/src/server.ts
sed -n '1,320p' packages/kernel/src/routes/sessions.ts
sed -n '1,360p' packages/kernel/src/routes/agents.ts
sed -n '1,360p' packages/kernel/src/routes/participants.ts
sed -n '1,320p' packages/kernel/src/services/agentState.ts
sed -n '1,460p' packages/kernel/src/routes/managedAgents.ts
sed -n '1,340p' packages/kernel/src/hooks/autoStream.ts
sed -n '1,280p' packages/kernel/src/cli.ts
sed -n '1,280p' packages/kernel/src/paths/global.ts
sed -n '1,280p' packages/kernel/src/state/store.ts
sed -n '460,920p' packages/kernel/src/routes/managedAgents.ts
sed -n '1,340p' packages/kernel/src/participants.ts
sed -n '1,320p' packages/kernel/src/sessions.ts
sed -n '1,260p' packages/kernel/src/paths/contextRef.ts
sed -n '1,320p' packages/kernel/src/routes/paths.ts
sed -n '1,260p' packages/kernel/src/project.ts
sed -n '1,300p' packages/kernel/src/hooks/bootstrap.ts
sed -n '1,300p' packages/kernel/src/hooks/post.ts
sed -n '1,320p' packages/kernel/src/events/writer.ts
sed -n '1,280p' packages/kernel/src/routes/events.ts
sed -n '1,260p' packages/kernel/src/paths/active.ts
sed -n '1,220p' packages/kernel/src/paths/identity.ts
sed -n '1,220p' packages/kernel/src/paths/registry.ts
sed -n '280,620p' packages/kernel/src/routes/events.ts
sed -n '1,220p' packages/kernel/src/routes/pathDeps.ts
sed -n '1,260p' packages/kernel/src/routes/stalePath.ts
sed -n '1,320p' packages/kernel/src/tmux/manager.ts
sed -n '1,260p' packages/kernel/src/tmux/commandRunner.ts
sed -n '1,320p' packages/kernel/src/runtimes/registry.ts
find packages/kernel/assets -maxdepth 3 -type f -print -exec sed -n '1,180p' {} \;
sed -n '1,260p' packages/kernel/src/tmux/naming.ts
sed -n '1,320p' packages/shared/src/managedAgents.ts
sed -n '1,220p' packages/kernel/src/runtimes/defaults.ts
sed -n '1,220p' packages/kernel/src/runtimes/validation.ts
sed -n '1,360p' packages/kernel/src/hooks/transcript.ts
sed -n '1,360p' packages/kernel/src/hooks/projectTurn.ts
sed -n '1,260p' packages/kernel/tests/hooks/autoStream.test.ts
rg -n "agents/.*/ping|ping" packages/kernel/src/routes packages/kernel/src/presence packages/kernel/src -g'*.ts'
sed -n '1,90p' packages/kernel/src/routes/presence.ts
sed -n '1,360p' packages/kernel/src/hooksInstall/index.ts
sed -n '1,220p' packages/kernel/src/hooksInstall/types.ts
pnpm -F f-mark exec pwd
node --version && pnpm --version
test -f planning/mcp/research-manual-phase1-2-hot-test.md && sed -n '1,260p' planning/mcp/research-manual-phase1-2-hot-test.md || true
```

Environment observed:

```text
pnpm -F f-mark exec pwd -> /home/roey/workspace/F-Mark/packages/kernel
node --version -> v24.15.0
pnpm --version -> 10.33.2
```

Hot-test commands were run as here-doc TSX harnesses:

```sh
pnpm -F f-mark exec tsx <<'TS'
# combined multi-path + managed spawn + runAutoStream route-injection harness
TS
```

Observed: failed with Node heap OOM before JSON output.

```sh
pnpm -F f-mark exec tsx <<'TS'
# narrowed multi-path/session/link/participants harness
TS
```

Observed: completed and printed JSON results summarized below.

```sh
pnpm -F f-mark exec tsx <<'TS'
# narrowed managed-agent spawn harness using runtime executable "true" and fake tmux runner
TS
```

Observed: completed and printed JSON results summarized below.

```sh
pnpm -F f-mark exec tsx <<'TS'
# runAutoStream with fetch routed to app.inject
TS
```

Observed: failed with Node heap OOM.

```sh
pnpm -F f-mark exec tsx <<'TS'
# runAutoStream with stubbed fetch, global active-session only
TS
```

Observed: completed and printed JSON results summarized below.

```sh
pnpm -F f-mark exec tsx <<'TS'
# direct event route injection without fetch stub
TS
```

Observed: first attempt used invalid participant id `ag-a` and correctly failed with `unknown participant`; rerun with valid `ag-aa` passed.

```sh
pnpm -F f-mark exec tsx <<'TS'
# direct fetch stub calling app.inject for event posts only
TS
```

Observed: failed with Node heap OOM.

## Detailed Results

### Multi-Path Session, Link, Participants

Expected:

- boot active path is project A;
- creating a session on active path A returns path A;
- registering `ag-hot-a` and linking it to session A succeeds;
- active-session state is available in both global project agent state and legacy project agent state;
- switching to project B isolates participants and state;
- `scope=all` sessions includes A and B.

Observed:

```json
{
  "linkA": {
    "participant_id": "ag-hot-a",
    "session_id": "2026-05-25-alpha-hot"
  },
  "activeSessionContents": {
    "globalActiveA": "2026-05-25-alpha-hot",
    "legacyActiveA": "2026-05-25-alpha-hot"
  },
  "participantsA": {
    "kind": "agent",
    "name": "Hot A",
    "color": "#f59e0b",
    "active_session": "2026-05-25-alpha-hot"
  },
  "switchB": {
    "activePath": "$TMP/b"
  },
  "participantsB": {
    "ag-hot-b": {
      "kind": "agent",
      "name": "Hot B",
      "color": "#f59e0b",
      "active_session": "2026-05-25-beta-hot"
    },
    "ag-hot-a": "absent"
  },
  "sessionsScopeAll": [
    {
      "id": "2026-05-25-beta-hot",
      "path": "$TMP/b",
      "path_id": "c367d36003ee"
    },
    {
      "id": "2026-05-25-alpha-hot",
      "path": "$TMP/a",
      "path_id": "7cb8c5878cad"
    }
  ]
}
```

Result: PASS.

Note: I initially expected active-session files to include a trailing newline. They do not; `writeActiveSession` writes the raw session id. This is expected by current code.

Cleanup: PASS for this completed harness (`cleanupBefore: true`, `cleanupAfter: false`).

### Managed Agent Spawn

Expected:

- `POST /managed-agents/spawn` with runtime `hotfake` and executable `true` succeeds;
- fake tmux receives `tmux new-session` with F-Mark env;
- global project agent state records `active-session`, `runtime`, `tmux-session`, and log;
- legacy project agent dir only receives active-session bridge;
- `GET /managed-agents` lists the agent alive;
- `GET /participants` exposes the managed agent active session.

Observed:

```json
{
  "spawn": {
    "participant_id": "ag-managed",
    "tmux_session": "fmark-project-8e7dcab2-ag-ag-managed",
    "runtime_id": "hotfake",
    "active_session": "2026-05-25-spawn-hot",
    "hooks_status": "unknown"
  },
  "stateFiles": {
    "globalActive": "2026-05-25-spawn-hot",
    "globalRuntime": "hotfake",
    "globalTmux": "fmark-project-8e7dcab2-ag-ag-managed",
    "globalLogExists": true,
    "legacyActive": "2026-05-25-spawn-hot",
    "legacyRuntime": null,
    "legacyTmux": null
  },
  "managedList": {
    "agents": [
      {
        "participant_id": "ag-managed",
        "tmux_session": "fmark-project-8e7dcab2-ag-ag-managed",
        "runtime_id": "hotfake",
        "alive": true
      }
    ],
    "terminals": []
  },
  "participants": {
    "kind": "agent",
    "name": "Managed Hot",
    "color": "#f59e0b",
    "runtime_id": "hotfake",
    "active_session": "2026-05-25-spawn-hot"
  }
}
```

Fake tmux boundary:

```json
[
  "tmux",
  "new-session",
  "-d",
  "-s",
  "fmark-project-8e7dcab2-ag-ag-managed",
  "-e",
  "F_MARK_RUNTIME_ID=hotfake",
  "-e",
  "F_MARK_PATH=$TMP/project",
  "-e",
  "F_MARK_SESSION_ID=2026-05-25-spawn-hot",
  "-e",
  "F_MARK_AGENT_ID=ag-managed",
  "-c",
  "$TMP/project",
  "--",
  "true"
]
```

Result: PASS.

Cleanup: PASS for this completed harness (`cleanupBefore: true`, `cleanupAfter: false`). No real tmux session was created.

### runAutoStream Active Session from Global State

Expected:

- global active-session exists for `ag-auto`;
- legacy `.f-mark/agents/ag-auto/active-session` is absent;
- `runAutoStream("ag-auto", "assistant", ...)` resolves the F-Mark session id from global state;
- it posts ping, prose, and turn-end to the resolved session id.

Observed with stubbed fetch:

```json
{
  "global": "2026-05-25-autostream-stub",
  "legacy": null,
  "exitCode": 0,
  "fetchCalls": [
    {
      "url": "http://localhost:7777/agents/ag-auto/ping",
      "method": "POST",
      "body": {}
    },
    {
      "url": "http://localhost:7777/sessions/2026-05-25-autostream-stub/events/prose",
      "method": "POST",
      "body": {
        "participant_id": "ag-auto",
        "content": "global stub works",
        "arbitrary": false,
        "path": "$TMP/project"
      }
    },
    {
      "url": "http://localhost:7777/sessions/2026-05-25-autostream-stub/events/turn-end",
      "method": "POST",
      "body": {
        "participant_id": "ag-auto",
        "path": "$TMP/project"
      }
    }
  ]
}
```

Result: PASS for active-session resolution from global state.

Cleanup: PASS for this completed harness (`cleanupBefore: true`, `cleanupAfter: false`).

### Event Routes

Expected:

- direct route injection accepts event posts with a valid participant id;
- files are written under the target session.

Observed:

```json
{
  "registered": {
    "id": "ag-aa",
    "name": "A",
    "color": "#f59e0b"
  },
  "prose": {
    "status": 200,
    "filename": "20260525T130005.150Z_ag-aa.prose.md"
  },
  "turnEnd": {
    "status": 200,
    "filename": "20260525T130005.152Z_ag-aa.turn-end.json"
  },
  "files": [
    "20260525T130005.150Z_ag-aa.prose.md",
    "20260525T130005.152Z_ag-aa.turn-end.json"
  ]
}
```

Result: PASS.

The first direct-route attempt used invalid id `ag-a` and got:

```json
{
  "status": 400,
  "body": {
    "error": "unknown participant: ag-a"
  }
}
```

That was harness error, not product discrepancy; valid ids require 2-12 chars after the prefix.

## Discrepancies / Risks

1. `fetch` stub routed to `app.inject` OOMs.

Observed in three variants:

- combined multi-path + managed + auto-stream route-injection harness;
- `runAutoStream` with `globalThis.fetch` forwarding to `server.app.inject`;
- even a minimal direct `fetch(...)` stub that forwards event POSTs to `app.inject`.

Representative output:

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command failed with exit code 134: tsx
```

Direct `app.inject` event route calls passed. Stubbed `runAutoStream` without app injection passed. So the current evidence points to the hot-test harness approach (`globalThis.fetch` returning `new Response(...)` around `app.inject`) rather than a confirmed kernel bug.

2. Cleanup for OOM harnesses is unknown.

Completed harnesses cleaned up their temp dirs. OOM harnesses died before they could print temp paths or run cleanup; isolated dirs matching `/tmp/fmark-phase12-*` may remain.

## Final Partial Verdict

Within the completed manual hot tests, Phase 1/2 behavior passed:

- session creation;
- agent link;
- participants `active_session`;
- multi-path/global agent-state isolation;
- runAutoStream active-session lookup from global state;
- managed-agent spawn with harmless fake runtime and fake tmux boundary.

The only unresolved finding is the repeatable OOM in the attempted route-injected `fetch` harness. I did not fix or edit code.

## Parent Live-Kernel Follow-Up

After this partial run, the parent agent ran a live-kernel manual hot test with real HTTP and real tmux, using an isolated temp root and a harmless runtime:

```json
{
  "runtime_id": "sleepy",
  "executable": "/usr/bin/sleep",
  "args": ["60"]
}
```

The first live-kernel run found a real discrepancy:

- `AgentStateStore` and `/managed-agents/spawn` used the active path's global agent-state bucket.
- But `createServer` initialized `TmuxManager` with the fallback root when `pathContextRef.active` already existed.
- Result: the spawned tmux session's `@fmark-project` tag pointed at the fallback project, while its F-Mark state pointed at the active project.

Fix applied:

- `createServer` now computes `initialProjectRoot = deps.pathContextRef?.get().active?.root() ?? deps.paths.root()`.
- The tmux manager and managed-agent route deps use that initial project root.
- Regression test added in `packages/kernel/tests/routes/managedAgents.test.ts`: `createServer initializes tmux against the active path when one exists`.

Manual retest result: PASS.

Retest covered:

- live kernel listening on `127.0.0.1`;
- HTTP session creation on the active path;
- `/agents/ag-manual/link`;
- global and legacy active-session files;
- `/participants` preferring the global active-session after deliberately corrupting the legacy pointer;
- `runAutoStream` posting to the live kernel and creating prose plus turn-end files;
- `/managed-agents/spawn` with real tmux and `/usr/bin/sleep`;
- global managed `runtime`, `tmux-session`, and `active-session` files;
- legacy active-session mirror only, with no legacy `tmux-session`;
- tmux `@fmark-project` equals the active root;
- `/managed-agents` reports the spawned agent alive;
- `/managed-agents/:id` delete cleans up the real tmux session.

Cleanup result:

- No leftover `fmark-manual-phase2-*` or `fmark-phase12-*` temp dirs.
- No leftover tmux sessions tagged with the manual temp roots.

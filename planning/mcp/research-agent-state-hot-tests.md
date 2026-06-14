# Phase 2 Agent State Hot Tests

Date: 2026-05-25
Worker: Phase 2 hot-test worker
Repo: `/home/roey/workspace/F-Mark`

Scope constraint honored: no production code or test files were edited. The only repo write for this phase is this report. Temp files were created under `/tmp` and removed.

## Summary

Result: PASS for the current single-path active-session behavior.

The hot test created an isolated F-Mark project, created a session through the assembled Fastify server with route injection, registered and linked an agent through existing routes, exercised managed-agent spawn through the existing route with a fake tmux subprocess boundary, and exercised hook active-session lookup through `runAutoStream` with stubbed HTTP posts.

Observed active-session files before cleanup:

- `/tmp/fmark-agent-state-hot-3m81l9/.f-mark/agents/ag-hot-one/active-session`
  - Contents: `2026-05-25-agent-state-hot`
  - Source: `POST /agents/ag-hot-one/link`
- `/tmp/fmark-agent-state-hot-3m81l9/.f-mark/agents/ag-managed-hot/active-session`
  - Contents: `2026-05-25-agent-state-hot`
  - Source: `POST /managed-agents/spawn` with `session_id`
- `/tmp/fmark-agent-state-hot-3m81l9/.f-mark/agents/ag-hook-fb/active-session`
  - Contents: `2026-05-25-agent-state-hot`
  - Source: `runAutoStream` fallback from `F_MARK_SESSION_ID`

Cleanup status: `/tmp/fmark-agent-state-hot-3m81l9` was removed. No real tmux session was created; tmux was faked by an injected `CommandRunner`.

## Commands Run

Read-only repo orientation:

```sh
pwd && git status --short
rg -n "active[-_ ]?session|activeSession|agent.*session|session.*agent|AgentState|AgentStateStore|register|link.*agent|managed-agent|managed agent|tmux" .
rg --files
rg -n "readActiveSession|writeActiveSession|agentsDirFor|agentsDirForPathId|registerAgentsRoutes|registerManagedAgentsRoutes" packages/kernel/src
sed -n '1,220p' packages/kernel/src/agents/activeSession.ts
sed -n '1,260p' packages/kernel/src/routes/agents.ts
sed -n '1,420p' packages/kernel/src/routes/managedAgents.ts
sed -n '200,240p' packages/kernel/src/hooks/autoStream.ts
```

Hot test command, run from `/home/roey/workspace/F-Mark`. `pnpm -F f-mark exec` executes from the kernel package, so imports are relative to `packages/kernel`.

```sh
pnpm -F f-mark exec tsx <<'TS'
import { mkdtemp, rm, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { initProject } from './src/project.ts';
import { paths } from './src/paths.ts';
import { createServer } from './src/server.ts';
import { runAutoStream } from './src/hooks/autoStream.ts';

function ok(stdout = '') { return { stdout, stderr: '', exitCode: 0 }; }
function fail(stderr = 'not found') { return { stdout: '', stderr, exitCode: 1 }; }

class MemoryTmuxRunner {
  calls = [];
  sessions = new Set();
  options = new Map();
  async run(argv) {
    this.calls.push([...argv]);
    if (argv[0] !== 'tmux') return fail('unexpected command');
    const sub = argv[1];
    if (sub === 'new-session') {
      const sIdx = argv.indexOf('-s');
      const session = sIdx >= 0 ? argv[sIdx + 1] : 'missing-session';
      this.sessions.add(session);
      return ok();
    }
    if (sub === 'set-option') {
      const tIdx = argv.indexOf('-t');
      const session = tIdx >= 0 ? argv[tIdx + 1] : '';
      const opt = argv[4];
      const value = argv[5] ?? '';
      this.options.set(`${session}:${opt}`, value);
      return ok();
    }
    if (sub === 'show-options') {
      const tIdx = argv.indexOf('-t');
      const session = tIdx >= 0 ? argv[tIdx + 1] : '';
      const opt = argv[argv.length - 1];
      const value = this.options.get(`${session}:${opt}`);
      return value === undefined ? fail('option not set') : ok(`${value}\n`);
    }
    if (sub === 'ls') return ok(`${[...this.sessions].join('\n')}\n`);
    if (sub === 'send-keys') return ok();
    if (sub === 'kill-session') {
      const tIdx = argv.indexOf('-t');
      if (tIdx >= 0) this.sessions.delete(argv[tIdx + 1]);
      return ok();
    }
    if (sub === 'capture-pane') return ok('snapshot');
    if (sub === 'display-message') return ok('0\n');
    if (sub === 'pipe-pane') return ok();
    if (sub === 'resize-window') return ok();
    if (sub === '-V') return ok('tmux 3.4\n');
    return ok();
  }
}

async function pathExists(path) {
  try { await stat(path); return true; } catch (err) { if (err?.code === 'ENOENT') return false; throw err; }
}

async function walkActiveFiles(root) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === 'active-session') out.push(full);
    }
  }
  await walk(root);
  return out.sort();
}

function parse(res) {
  try { return res.json(); } catch { return res.body; }
}

const root = await mkdtemp(join(tmpdir(), 'fmark-agent-state-hot-'));
const p = paths(root);
const runner = new MemoryTmuxRunner();
const result = {
  tempRoot: root,
  projectFilesBeforeCleanup: {},
  routeResults: {},
  managedSpawn: {},
  hookRuns: {},
  activeSessionFiles: [],
  tmuxCalls: [],
  cleanup: {},
};

const server = createServer({
  token: null,
  paths: p,
  allowProcessApiNoAuth: true,
  commandRunner: runner,
});

try {
  await initProject(p);
  await writeFile(p.tokenFile(), 'tok-hot\n', 'utf8');
  await server.app.ready();

  const sessionRes = await server.app.inject({
    method: 'POST',
    url: '/sessions',
    payload: { slug: 'agent-state-hot' },
  });
  const session = parse(sessionRes);
  result.routeResults.createSession = { status: sessionRes.statusCode, body: session };

  const registerRes = await server.app.inject({
    method: 'POST',
    url: '/participants/register',
    payload: { kind: 'agent', name: 'Hot Agent', suggested_id: 'ag-hot-one' },
  });
  result.routeResults.registerAgent = { status: registerRes.statusCode, body: parse(registerRes) };

  const linkRes = await server.app.inject({
    method: 'POST',
    url: '/agents/ag-hot-one/link',
    payload: { session_id: session.id },
  });
  result.routeResults.linkAgent = { status: linkRes.statusCode, body: parse(linkRes) };

  const participantsRes = await server.app.inject({ method: 'GET', url: '/participants' });
  result.routeResults.participantsAfterLink = {
    status: participantsRes.statusCode,
    body: parse(participantsRes),
  };

  const fallbackRegRes = await server.app.inject({
    method: 'POST',
    url: '/participants/register',
    payload: { kind: 'agent', name: 'Hook Fallback Agent', suggested_id: 'ag-hook-fb' },
  });
  result.routeResults.registerHookFallbackAgent = { status: fallbackRegRes.statusCode, body: parse(fallbackRegRes) };

  const spawnRes = await server.app.inject({
    method: 'POST',
    url: '/managed-agents/spawn',
    payload: {
      runtime_id: 'claude',
      suggested_participant_id: 'ag-managed-hot',
      name: 'Managed Hot Agent',
      session_id: session.id,
    },
  });
  const spawnBody = parse(spawnRes);
  result.managedSpawn.response = { status: spawnRes.statusCode, body: spawnBody };

  const managedListRes = await server.app.inject({ method: 'GET', url: '/managed-agents' });
  result.managedSpawn.list = { status: managedListRes.statusCode, body: parse(managedListRes) };

  const activeLinkedPath = join(p.fmarkDir(), 'agents', 'ag-hot-one', 'active-session');
  const activeManagedPath = join(p.fmarkDir(), 'agents', 'ag-managed-hot', 'active-session');
  const tmuxManagedPath = join(p.fmarkDir(), 'agents', 'ag-managed-hot', 'tmux-session');
  const runtimeManagedPath = join(p.fmarkDir(), 'agents', 'ag-managed-hot', 'runtime');
  result.projectFilesBeforeCleanup.linkedActiveSession = {
    path: activeLinkedPath,
    contents: await readFile(activeLinkedPath, 'utf8'),
  };
  result.projectFilesBeforeCleanup.managedActiveSession = {
    path: activeManagedPath,
    contents: await readFile(activeManagedPath, 'utf8'),
  };
  result.projectFilesBeforeCleanup.managedTmuxSession = {
    path: tmuxManagedPath,
    contents: await readFile(tmuxManagedPath, 'utf8'),
  };
  result.projectFilesBeforeCleanup.managedRuntime = {
    path: runtimeManagedPath,
    contents: await readFile(runtimeManagedPath, 'utf8'),
  };

  const transcriptPath = join(root, 'transcript.jsonl');
  await writeFile(
    transcriptPath,
    [
      JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'hello' }] }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'hot hook reply' }] }),
    ].join('\n'),
    'utf8',
  );

  const fetchCallsExisting = [];
  globalThis.fetch = async (url, opts = {}) => {
    fetchCallsExisting.push({ url: String(url), body: opts.body ? JSON.parse(String(opts.body)) : null });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const hookExistingExit = await runAutoStream(
    'ag-hot-one',
    'assistant',
    JSON.stringify({ session_id: 'external-runtime-session', transcript_path: transcriptPath, cwd: root, hook_event_name: 'Stop', stop_hook_active: false }),
    { env: { ...process.env, F_MARK_PATH: root } },
  );
  result.hookRuns.existingPointer = { exitCode: hookExistingExit, fetchCalls: fetchCallsExisting };

  const fetchCallsFallback = [];
  globalThis.fetch = async (url, opts = {}) => {
    fetchCallsFallback.push({ url: String(url), body: opts.body ? JSON.parse(String(opts.body)) : null });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const hookFallbackExit = await runAutoStream(
    'ag-hook-fb',
    'assistant',
    JSON.stringify({ session_id: 'external-runtime-session-2', transcript_path: transcriptPath, cwd: root, hook_event_name: 'Stop', stop_hook_active: false }),
    { env: { ...process.env, F_MARK_PATH: root, F_MARK_SESSION_ID: session.id } },
  );
  const fallbackActivePath = join(p.fmarkDir(), 'agents', 'ag-hook-fb', 'active-session');
  result.hookRuns.envFallbackWritesPointer = {
    exitCode: hookFallbackExit,
    fetchCalls: fetchCallsFallback,
    activeSessionPath: fallbackActivePath,
    activeSessionContents: await readFile(fallbackActivePath, 'utf8'),
  };

  const activeFiles = await walkActiveFiles(root);
  result.activeSessionFiles = await Promise.all(activeFiles.map(async (file) => ({
    path: file,
    relative: relative(root, file),
    contents: await readFile(file, 'utf8'),
  })));
  result.tmuxCalls = runner.calls;
} finally {
  await server.app.close();
  await rm(root, { recursive: true, force: true });
  result.cleanup.removedTempRoot = !(await pathExists(root));
  result.cleanup.realTmuxCreated = false;
  console.log(JSON.stringify(result, null, 2));
}
TS
```

## Expected vs Observed

### 1. Temp project and session through Fastify route injection

Expected:

- `POST /sessions` returns 200.
- Session directory is scoped to the temp project.
- Session id uses the current UTC date prefix from existing `sessions.ts`.

Observed:

```json
{
  "status": 200,
  "body": {
    "id": "2026-05-25-agent-state-hot",
    "slug": "agent-state-hot",
    "path": "/tmp/fmark-agent-state-hot-3m81l9",
    "path_id": "ed2d4165ff6a"
  }
}
```

Pass/fail: PASS.

### 2. Register and link an agent through existing routes

Expected:

- `POST /participants/register` accepts `ag-hot-one`.
- `POST /agents/ag-hot-one/link` accepts the created session id.
- Link writes `<project>/.f-mark/agents/ag-hot-one/active-session`.
- `GET /participants` reports `active_session` for the linked agent.

Observed:

```json
{
  "registerAgent": {
    "status": 200,
    "body": {
      "id": "ag-hot-one",
      "name": "Hot Agent",
      "color": "#f59e0b"
    }
  },
  "linkAgent": {
    "status": 200,
    "body": {
      "participant_id": "ag-hot-one",
      "session_id": "2026-05-25-agent-state-hot"
    }
  },
  "participantsAfterLink": {
    "status": 200,
    "active_session": "2026-05-25-agent-state-hot"
  },
  "file": {
    "path": "/tmp/fmark-agent-state-hot-3m81l9/.f-mark/agents/ag-hot-one/active-session",
    "contents": "2026-05-25-agent-state-hot"
  }
}
```

Pass/fail: PASS.

### 3. Managed-agent spawn with fake tmux/runtime path

Expected:

- Existing `POST /managed-agents/spawn` returns 200.
- The fake `CommandRunner` captures tmux argv without creating a real tmux session.
- Spawn writes:
  - `<project>/.f-mark/agents/ag-managed-hot/tmux-session`
  - `<project>/.f-mark/agents/ag-managed-hot/runtime`
  - `<project>/.f-mark/agents/ag-managed-hot/active-session`
- `GET /managed-agents` sees the fake live session.

Observed:

```json
{
  "response": {
    "status": 200,
    "body": {
      "participant_id": "ag-managed-hot",
      "tmux_session": "fmark-fmark-agent-state-hot-3m81l9-ed2d4165-ag-ag-managed-hot",
      "runtime_id": "claude",
      "active_session": "2026-05-25-agent-state-hot",
      "hooks_status": "missing"
    }
  },
  "files": {
    "active-session": "2026-05-25-agent-state-hot",
    "tmux-session": "fmark-fmark-agent-state-hot-3m81l9-ed2d4165-ag-ag-managed-hot",
    "runtime": "claude"
  },
  "list": {
    "status": 200,
    "agents": [
      {
        "participant_id": "ag-managed-hot",
        "tmux_session": "fmark-fmark-agent-state-hot-3m81l9-ed2d4165-ag-ag-managed-hot",
        "runtime_id": "claude",
        "alive": true
      }
    ],
    "terminals": []
  }
}
```

Captured tmux argv:

```json
[
  [
    "tmux",
    "new-session",
    "-d",
    "-s",
    "fmark-fmark-agent-state-hot-3m81l9-ed2d4165-ag-ag-managed-hot",
    "-e",
    "F_MARK_RUNTIME_ID=claude",
    "-e",
    "F_MARK_SESSION_ID=2026-05-25-agent-state-hot",
    "-e",
    "F_MARK_PATH=/tmp/fmark-agent-state-hot-3m81l9",
    "-e",
    "F_MARK_AGENT_ID=ag-managed-hot",
    "-c",
    "/tmp/fmark-agent-state-hot-3m81l9",
    "--",
    "claude"
  ],
  [
    "tmux",
    "set-option",
    "-t",
    "fmark-fmark-agent-state-hot-3m81l9-ed2d4165-ag-ag-managed-hot",
    "@fmark-project",
    "/tmp/fmark-agent-state-hot-3m81l9"
  ],
  [
    "tmux",
    "set-option",
    "-t",
    "fmark-fmark-agent-state-hot-3m81l9-ed2d4165-ag-ag-managed-hot",
    "@fmark-participant",
    "ag-managed-hot"
  ],
  [
    "tmux",
    "ls",
    "-F",
    "#{session_name}"
  ],
  [
    "tmux",
    "show-options",
    "-t",
    "fmark-fmark-agent-state-hot-3m81l9-ed2d4165-ag-ag-managed-hot",
    "-v",
    "@fmark-project"
  ]
]
```

Pass/fail: PASS.

Safety note: this was the existing managed-agent spawn route with an injected fake `CommandRunner`. It did not spawn a real runtime CLI and did not create a real tmux session.

### 4. Hook active-session lookup behavior

Expected:

- With an existing active-session pointer, `runAutoStream` reads it and posts projected events to that F-Mark session.
- With no pointer but a valid `F_MARK_SESSION_ID`, `runAutoStream` writes the pointer and posts projected events to that F-Mark session.

Observed existing pointer:

```json
{
  "exitCode": 0,
  "fetchCalls": [
    "http://localhost:7777/agents/ag-hot-one/ping",
    "http://localhost:7777/sessions/2026-05-25-agent-state-hot/events/prose",
    "http://localhost:7777/sessions/2026-05-25-agent-state-hot/events/turn-end"
  ],
  "eventBodyPath": "/tmp/fmark-agent-state-hot-3m81l9"
}
```

Observed env fallback write:

```json
{
  "exitCode": 0,
  "fetchCalls": [
    "http://localhost:7777/agents/ag-hook-fb/ping",
    "http://localhost:7777/sessions/2026-05-25-agent-state-hot/events/prose",
    "http://localhost:7777/sessions/2026-05-25-agent-state-hot/events/turn-end"
  ],
  "activeSessionPath": "/tmp/fmark-agent-state-hot-3m81l9/.f-mark/agents/ag-hook-fb/active-session",
  "activeSessionContents": "2026-05-25-agent-state-hot"
}
```

Pass/fail: PASS.

## Code-Level Evidence

Current single-path pointer helper:

- `packages/kernel/src/agents/activeSession.ts`
  - `activeSessionPath(agentsDir, participantId)` returns `join(agentsDir, participantId, "active-session")`.
  - `writeActiveSession` writes via `active-session.tmp` then `rename`.
  - `readActiveSession` trims file contents and returns `null` on `ENOENT`.

Current linked-agent route:

- `packages/kernel/src/routes/agents.ts`
  - `POST /agents/:id/link` verifies `sessionExists`.
  - It writes to `join(p.fmarkDir(), "agents")`.

Current managed spawn route:

- `packages/kernel/src/routes/managedAgents.ts`
  - `agentsDir()` resolves through `agentsDirFor({ ref: deps.pathContextRef, fallback: paths })`.
  - In the single-path hot test, this fell back to `<root>/.f-mark/agents`.
  - When `session_id` is present, spawn writes `writeActiveSession(agentsDir(), participantId, body.session_id)`.

Current hook lookup:

- `packages/kernel/src/hooks/autoStream.ts`
  - `resolveFmarkSessionId` sets `const agentsDir = join(ctx.fmarkDir, "agents")`.
  - It first reads existing active-session.
  - If none exists, it tries `env.F_MARK_SESSION_ID`, then payload `fmark_session_id`, then latest session, writing the resolved pointer.

## Debts Found

1. Single-path behavior passes, but multi-path/global agent-state behavior is not proven by this hot test.

   Evidence:

   - `registerManagedAgentsRoutes` can write agent state under `~/.config/f-mark/projects/<pathId>/agents` when `pathContextRef` is wired.
   - `POST /agents/:id/link` still writes `join(p.fmarkDir(), "agents")`.
   - `runAutoStream` still reads and writes `join(ctx.fmarkDir, "agents")`.
   - `listParticipants` enriches active sessions from `join(p.fmarkDir(), "agents")`.

   Risk: in a true multi-path boot, managed spawn may write `active-session` to the global project agents dir while hooks and participant listing still look in the legacy per-project `.f-mark/agents` dir. AgentStateStore should define one authoritative lookup/write path and make routes, hooks, participant enrichment, reconcile, and managed-agent commands use it consistently.

2. The managed spawn route writes `active-session` for `body.session_id` but does not itself verify `sessionExists`.

   In this hot test the session id was known-good because it came from `POST /sessions`. If external callers can pass arbitrary `session_id`, AgentStateStore should decide whether spawn should validate the session pointer before persisting it.

3. Needed follow-up hot command for multi-path storage:

   Build a temp `PathContextRef` with a temp `XDG_CONFIG_HOME`/global root, create a server with that ref, spawn a managed agent with `session_id`, then compare:

   - `global.projectAgentsDir(pathId)/<agent>/active-session`
   - `<project>/.f-mark/agents/<agent>/active-session`
   - `GET /participants` `active_session`
   - `runAutoStream` lookup under `F_MARK_PATH=<project>`

   Expected debt-revealing outcome before AgentStateStore: managed state appears in the global project agents dir while hook and participants continue to consult legacy `.f-mark/agents`.


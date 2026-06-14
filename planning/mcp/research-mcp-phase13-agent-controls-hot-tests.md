# MCP Phase 13 Agent Controls Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 13 backend status/control routes, runtime command mapping, paused wake filtering, reconnect, and real vendor compact/clear delivery.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| Capture runtime control-route matrix | PASS | Status, pause/resume, rename, context/access, notified disable, compact/clear command mapping, dead-pane reconnect all passed |
| Claude real vendor compact/clear control | PASS | Real Claude process spawned; `/compact` and `/clear` routes succeeded while connected |
| Codex real vendor compact/clear control | PASS | Real Codex process spawned; `/compact` and `/clear` routes succeeded while connected |
| Gemini real vendor compact/clear control | PASS | Real Gemini process spawned; `/compress` and `/clear` routes succeeded while connected |

Hot report:

```text
/tmp/fmark-mcp-phase13-hot-hNO9TC/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase13-agent-controls-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase13-hot-hNO9TC/report.json
{
  "run": "phase13-mplrhd8k",
  "artifactRoot": "/tmp/fmark-mcp-phase13-hot-hNO9TC",
  "passes": 4
}
```

## Capture Matrix

The deterministic control matrix used a capture runtime wired under the `claude`, `codex`, and `gemini` runtime ids. This proved the route state changes and exact command text sent over tmux:

- `GET /managed-agents/status` returned connected agents with runtime/session state.
- `POST /managed-agents/:id/pause` persisted `paused: true`.
- `POST /sessions/:id/wake` skipped a paused target with `reason: "paused"`.
- `POST /managed-agents/:id/resume` persisted `paused: false`.
- `PATCH /managed-agents/:id` updated `display_name`.
- `GET /managed-agents/:id/context` returned `unknown`.
- `GET /managed-agents/:id/access` returned read-only unsupported access state.
- `PATCH /managed-agents/:id/access` returned `409` because live access changes are not verified.
- Wake marked Codex `activity_state: "notified"`.
- Compact while `notified` returned `409`.
- `fmark_get_inbox` cleared the notified state back to `idle`.
- Claude command mapping: `/compact`, `/clear`.
- Codex command mapping: `/compact`, `/clear`.
- Gemini command mapping: `/compress`, `/clear`.
- Killing the Gemini pane changed status to `detached`.
- `POST /managed-agents/:id/reconnect` spawned a new connected pane and injected a wake packet.

Session:

```text
2026-05-25-phase13-mplrhd8k-controls
```

Agents:

- `ag-p13-claude`
- `ag-p13-codex`
- `ag-p13-gemini`

## Real Vendor Runs

The real-vendor checks used actual local vendor executables in isolated temp projects/config homes.

Claude:

```text
session: 2026-05-25-phase13-mplrhd8k-claude
participant: ag-p13-claude
process: claude --name 2026-05-25-phase13-mplrhd8k-claude
commands: /compact, /clear
```

Codex:

```text
session: 2026-05-25-phase13-mplrhd8k-codex
participant: ag-p13-codex
process: node /home/roey/.local/share/mise/installs/node/lts/bin/codex
commands: /compact, /clear
```

Gemini:

```text
session: 2026-05-25-phase13-mplrhd8k-gemini
participant: ag-p13-gemini
process: node /home/roey/.local/share/mise/installs/node/lts/bin/gemini
commands: /compress, /clear
```

The capture matrix is the proof of exact command text over the tmux input queue. The real-vendor runs prove the same routes operate against actual Claude/Codex/Gemini sessions and leave those sessions connected.

## Build Sanity

Before the hot run:

```bash
pnpm -F @f-mark/shared build
pnpm -F f-mark build
pnpm -F @f-mark/renderer exec tsc -b --pretty false
```

All passed. These are sanity checks only; the gate evidence is the hot run above.

## Gate Decision

Phase 13 is complete for backend status/control routes:

- The backend now exposes a typed status response for the Agents tab.
- Pause/resume, rename, reconnect, compact, clear, context read, access read, and unsupported access change paths are implemented.
- Compact/clear are blocked while an agent is `running`, `notified`, or `access-pending`.
- Runtime command mapping is verified for Claude, Codex, and Gemini.
- Real vendor processes were hot-checked for compact/clear route delivery.

Context remains `unknown` because no verified status-line/context source is enabled in this workspace. The UI should render `Unknown` instead of inventing token counts.

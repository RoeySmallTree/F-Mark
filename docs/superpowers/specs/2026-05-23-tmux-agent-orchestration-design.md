# Tmux-Orchestrated Agent Sessions — Design Spec

> **For agentic workers:** This is the design source-of-truth for the agent-orchestration feature. The implementation plan derived from this spec lives in `docs/superpowers/plans/` (created by `writing-plans` after spec approval). This document captures decisions and architecture, not per-task implementation steps.

## Summary

Add a process-orchestration layer to the F-Mark kernel so the user can spawn, supervise, surface, **and remote-control** agent CLIs (Claude Code, Codex, Gemini, or any custom runtime) directly from the F-Mark UI. The kernel owns detached tmux sessions for managed agents and plain terminal panes; in-browser xterm.js overlays give the user manual control of any pane. Presence (online/offline) is driven by a daemon supervisor spawned by the agent's auto-stream hook — independent of model activity, decoupled from tmux ownership — so the same presence machinery works for both F-Mark-managed and user-launched agents.

A bidirectional **control plane** sits over the orchestration layer: outbound (agent → kernel) uses HTTP from hook events plus transcript parsing in the daemon to surface live telemetry (context-window utilization, current tool, awaiting-approval state, idle/active); inbound (kernel → agent) uses `tmux send-keys` for managed panes to inject slash-commands, interrupt the agent, or send free-text messages. Un-managed agents (launched by the user in their own terminal) get the outbound half only.

This spec also absorbs and supersedes the in-flight `2026-05-23-auto-stream-hook.md` plan; that plan's per-Stop transcript parsing collapses into the supervisor daemon.

## Goals

1. **One-click agent spinup.** A `+` button in the top bar offers Claude / Codex / Gemini / Terminal. Clicking any of the first three spawns a managed tmux session with the runtime pre-loaded, the active-session pointer pre-wired, the auto-stream hook installed, and the initial onboarding prompt sent to the REPL via `tmux send-keys`. Zero terminal context-switching for the user.
2. **Kernel-managed agent lifecycle.** The kernel knows about every managed agent — list, kill (the "say goodbye" action), rename, open-terminal-overlay. Tmux sessions survive kernel restarts (detached); on next kernel start the kernel reconciles surviving sessions and presence resumes naturally.
3. **Multi-agent orchestration.** Multiple managed agents can run concurrently against the same F-Mark session (the event log is already append-only and participant-aware). Terminal panes are first-class peers, listed alongside agents in the top bar; if a user types `claude` inside a terminal pane and the auto-stream hook fires, the participant appears in the agents list automatically — same tmux session, now with agent metadata.
4. **Bidirectional control plane.** From the UI, the user can see live agent telemetry (context-window %, awaiting-approval state, current tool, idle/active) and send control actions (compact / interrupt / free-text message) into managed agents. Same wire protocol across all three runtimes; per-runtime capability differences (e.g., Codex has no native idle-detection hook) are surfaced honestly in the UI rather than papered over.

## Non-Goals

- **Multi-machine orchestration.** Spawn always targets the kernel's host machine. `--remote` mode targets the SSH'd-into box; `--container` targets the container; cross-machine fleet management is out of scope.
- **Coordinating turn-taking between concurrent agents.** The event log is append-only and tolerates concurrent writers; we do not add scheduling, locking, or fairness primitives. Two agents posting at once will interleave by timestamp.
- **Windows without WSL.** Tmux is the chosen transport. Windows users go through WSL (which the environment probe will detect).
- **Replacing the existing AGENT.md / SKILL.md docs.** Those still drive the agent-side protocol. This spec only adds the orchestration layer above them.

## Architecture Overview

Six new logical pieces, all additive — no existing event-log or participant semantics change.

1. **Tmux Manager** (kernel module, `packages/kernel/src/tmux/`).
   Owns tmux session creation, naming, listing, killing, and reconciliation. Knows the F-Mark naming convention. Spawns the runtime CLI inside the new session and uses `tmux send-keys` to deliver the kickoff prompt after a runtime-specific ready delay. Identity-agnostic: works for agent sessions and bare terminal sessions identically. **Also the transport for the inbound half of the control plane** (kernel → agent commands).

2. **Runtime Registry** (kernel module + per-project config file, `.f-mark/runtimes.json`).
   Data-driven catalog mapping `runtime_id → { displayName, command, icon, readyDelayMs, env?, args?, hookConfig }`. Ships with `claude`, `codex`, `gemini` defaults. Users add custom runtimes via Settings → Connected Agents → Manage Runtimes. Custom runtimes render with a generic bot icon if no built-in icon matches. The `hookConfig` block per runtime declares where and how F-Mark installs its hooks (see "Hook Installation" below).

3. **Supervisor Daemon** (kernel CLI subcommand, `f-mark hook supervisor`).
   Detached Node process spawned by the agent's auto-stream hook on first fire. Single instance per `agent_id` (flock'd at `.f-mark/agents/<id>/.supervisor.lock`). Owns four responsibilities for the agent's lifetime:
   - **Heartbeat:** POST `/agents/:id/heartbeat` every ~15s.
   - **Transcript streaming:** watch the runtime's JSONL transcript via `fs.watch` and POST new turns as `tool-use` / `prose` (arbitrary + concluding) events in order.
   - **Telemetry derivation:** on transcript change, recompute `context_pct` (tokens used / context-window size for the runtime's model), `last_tool` (most recent `tool_use` without a paired `tool_result`), `idle_state` (derived from time-since-last-event + last hook event kind). Post via `POST /agents/:id/telemetry`. Stateful changes broadcast over WS.
   - **Death detection:** poll `kill -0 <agent_pid>` between heartbeats; on failure, POST `/agents/:id/unlink` and exit.

   **This component subsumes the work the in-flight `2026-05-23-auto-stream-hook.md` plan distributes across each Stop hook fire.** That plan is refactored (see "Auto-Stream-Hook Plan Refactor" below).

4. **Presence + Control API** (kernel HTTP routes + WS channels, `packages/kernel/src/routes/managed-agents.ts`, `packages/kernel/src/ws/pane.ts`).
   HTTP endpoints for spawn / kill / list-managed / link / unlink / heartbeat / **telemetry / command**. WebSocket channels: `pane.<tmux_session_id>` (terminal piping), presence events on the existing bus, **and `telemetry.<participant_id>` broadcasts**.

5. **Guide Endpoint Extension** (`GET /guide?agent_id=<id>&session_id=<id>`).
   Existing `/guide` route extended to accept query params and substitute them into a tailored onboarding markdown. Used by:
   - The renderer's "Reconnect" modal (shown for offline agents) — user copies the rendered command and pastes into wherever they're launching from.
   - The kernel's own auto-launch flow — same renderer builds the `tmux send-keys` payload pushed into a freshly-spawned managed pane. Single source of truth for "how an agent joins F-Mark."

6. **Hook Installer** (kernel module + first-run UI flow).
   On first spawn of a runtime, the kernel checks whether F-Mark's hooks are present in that runtime's config file (path declared in the runtime's `hookConfig`). If absent, the renderer prompts: "Install F-Mark hooks for Claude Code? (modifies ~/.claude/settings.json)" — explicit consent, one-time per runtime per machine. Hooks installed: the runtime's equivalents of `Stop`, `UserPromptSubmit`, `PostToolUse`, `PreToolUse`, `Notification`/`PermissionRequest`, `PreCompact`/`PreCompress` — all bound to the single one-liner `npx f-mark hook ensure-supervisor <agent_id>`. The installer is idempotent and never removes hooks the user added themselves; it merges into the runtime's expected hook config format.

### Presence Data Flow

```
[managed-agent spawn path]
  Renderer POST /managed-agents/spawn
    → Tmux Manager creates session "fmark-<proj>-ag-<id>"
    → spawns runtime CLI with auto-stream hook config
    → after readyDelayMs, send-keys the rendered guide markdown
  Runtime CLI starts → first hook fires
    → hook runs `f-mark hook ensure-supervisor <agent_id>`
    → flock'd: supervisor spawns detached, hook exits
  Supervisor loop (every 15s):
    POST /agents/:id/heartbeat
    kill -0 <agent_pid>
  Kernel receives heartbeat → updates in-memory presence map
    → broadcasts on WS bus → renderer flips dot green

[death path]
  Agent CLI exits (user types /exit, Ctrl+D, crash)
    → next supervisor poll: kill -0 fails
    → POST /agents/:id/unlink → supervisor exits
  Kernel clears presence + broadcasts → renderer flips dot gray + shows "Reconnect"
  Tmux session may still exist (if no `tmux kill-session`) — Tmux Manager reconciles on next list
```

### Manual / Reconnect Path

```
[user clicks "Reconnect" on offline agent]
  Renderer fetches GET /guide?agent_id=ag-claude&session_id=2026-05-23-foo
  Modal shows rendered markdown with launch command pre-substituted:
    claude
    (then paste this as your first message:)
    > You are participant ag-claude in F-Mark session 2026-05-23-foo. ...
  User runs in their own terminal (or in a new terminal pane via the Terminal entry)
  Runtime starts → hook fires → ensure-supervisor → presence flips green
```

## Control Plane

A bidirectional channel between the kernel and managed agents, using two distinct transports because none of Claude / Codex / Gemini expose external-action triggers in their hook output schemas.

### Outbound — agent → kernel (telemetry + events)

Two layered mechanisms collaborating inside the Supervisor Daemon:

- **Hook events as edge-triggers.** Every fire of the runtime's hooks (Stop, UserPromptSubmit, PreToolUse, PostToolUse, Notification/PermissionRequest, PreCompact/PreCompress, SessionStart) calls `npx f-mark hook ensure-supervisor <agent_id>`. The supervisor receives the stdin JSON via a per-hook event queue file (`.f-mark/agents/<id>/.events/<ts>.json`) that the hook drops before exiting. The supervisor's event-queue watcher consumes each file, translates it to the kernel's event model, and POSTs.

- **Transcript polling as level-triggered.** The supervisor's `fs.watch` on the runtime's JSONL transcript catches every model turn including state hooks miss (e.g., token usage). The daemon recomputes derived telemetry on every transcript change.

**Derived telemetry shipped to the kernel:**

- `context_pct` — tokens used / context-window cap for the runtime's currently-active model. Computed by walking the transcript JSONL and summing input/output token counts (each runtime exposes these in transcript entries; differences in field names are handled by runtime-specific transcript parsers in the daemon). The context-window cap is looked up from a per-model table maintained in the daemon (e.g., `claude-sonnet-4-6`: 200k, `claude-opus-4-7[1m]`: 1M, `gpt-5.5`: 256k, `gemini-2.5-pro`: 1M). Updates whenever transcript grows.
- `last_tool` — the most recent `tool_use` entry without a paired `tool_result`. Carries `{tool_name, tool_input, started_at}`. Cleared when the `tool_result` lands.
- `awaiting_approval` — flipped true on `Notification` (Claude/Gemini, when `event_kind: permission_prompt`) or `PermissionRequest` (Codex). Cleared on the next `PostToolUse` or `Stop`.
- `idle_state` — derived from `now - last_hook_event_ts` exceeding a runtime-specific threshold (Claude/Gemini have native idle hooks we use directly; for Codex we use the heuristic). One of `active | thinking | idle | awaiting_approval | dead`.

**Per-runtime hook-event mapping** (declared in `runtimes.json` `hookConfig.events`):

| Logical event | Claude Code | Codex | Gemini CLI |
|---|---|---|---|
| TurnStart | `UserPromptSubmit` | `UserPromptSubmit` | `BeforeAgent` |
| TurnEnd | `Stop` | `Stop` | `AfterAgent` |
| ToolBefore | `PreToolUse` | `PreToolUse` | `BeforeTool` |
| ToolAfter | `PostToolUse` | `PostToolUse` | `AfterTool` |
| ApprovalNeeded | `Notification` (filter: `permission_prompt`) | `PermissionRequest` | `Notification` (filter: `permission_prompt`) |
| Idle | `Notification` (filter: `idle_prompt`) | *(derived)* | `Notification` (filter: `idle_prompt`) |
| Compacting | `PreCompact` | `PreCompact` | `PreCompress` |
| SessionStart | `SessionStart` | `SessionStart` | `SessionStart` |

### Inbound — kernel → agent (commands)

`tmux send-keys` is the only universal transport for action injection. The agent treats the keystrokes as if the user typed them in its TUI. F-Mark exposes three command types via `POST /managed-agents/:id/command`:

- `{ type: "slash", command: "compact" | "clear" | "resume" | <free> }` — sends `/<command>` followed by Enter. Used by the UI's "Compact now" action and any future slash-driven flows.
- `{ type: "interrupt" }` — sends Ctrl-C (`tmux send-keys C-c`). Stops the current model turn.
- `{ type: "message", text: <string> }` — sends the text followed by Enter. Used by the "Send a message" inline input on the agent chip; lets the user nudge an agent without leaving F-Mark.

For un-managed agents (no F-Mark-owned tmux session), the command endpoint returns `409 Conflict` with `{ reason: "unmanaged_pane", offer: "open_overlay" }`. The renderer surfaces this as "Open the terminal overlay first" — the user attaches via F-Mark, and from that point the kernel owns send-keys access.

### Capability matrix — what each runtime supports

Surfaced honestly in the UI (capabilities a runtime lacks render as disabled menu items with explanation tooltips).

| Capability | Claude Code | Codex | Gemini CLI |
|---|---|---|---|
| Live lifecycle stream | ✓ | ✓ | ✓ |
| Token-derived `context_pct` | ✓ | ✓ | ✓ |
| `awaiting_approval` state | ✓ (Notification) | ✓ (PermissionRequest hook) | ✓ (Notification) |
| `idle_state` from native hook | ✓ | ✗ (derived only) | ✓ |
| `PreCompact` observability | ✓ | ✓ | ✓ (PreCompress) |
| Tool-use block / mutate | ✓ | ✓ | ✓ |
| Slash-command injection via send-keys | ✓ (managed) | ✓ (managed) | ✓ (managed) |
| Slash-command injection in un-managed panes | ✗ | ✗ | ✗ |
| Hook config location | `~/.claude/settings.json` | `~/.codex/config.toml` | `~/.gemini/settings.json` |

## Data Model

### `.f-mark/runtimes.json` (new)

Per-project, with the kernel writing defaults on `initProject()` if absent.

```json
{
  "version": "1.0",
  "runtimes": {
    "claude": {
      "displayName": "Claude Code",
      "command": "claude",
      "icon": "claude",
      "readyDelayMs": 2000,
      "hookConfig": {
        "path": "~/.claude/settings.json",
        "format": "claude-settings",
        "events": {
          "TurnStart": "UserPromptSubmit",
          "TurnEnd": "Stop",
          "ToolBefore": "PreToolUse",
          "ToolAfter": "PostToolUse",
          "ApprovalNeeded": "Notification",
          "Idle": "Notification",
          "Compacting": "PreCompact",
          "SessionStart": "SessionStart"
        },
        "notificationFilter": { "ApprovalNeeded": "permission_prompt", "Idle": "idle_prompt" }
      },
      "transcriptFormat": "claude-jsonl"
    },
    "codex": {
      "displayName": "Codex",
      "command": "codex",
      "icon": "codex",
      "readyDelayMs": 1500,
      "hookConfig": {
        "path": "~/.codex/config.toml",
        "format": "codex-toml",
        "events": {
          "TurnStart": "UserPromptSubmit",
          "TurnEnd": "Stop",
          "ToolBefore": "PreToolUse",
          "ToolAfter": "PostToolUse",
          "ApprovalNeeded": "PermissionRequest",
          "Compacting": "PreCompact",
          "SessionStart": "SessionStart"
        }
      },
      "transcriptFormat": "codex-jsonl"
    },
    "gemini": {
      "displayName": "Gemini",
      "command": "gemini",
      "icon": "gemini",
      "readyDelayMs": 1500,
      "hookConfig": {
        "path": "~/.gemini/settings.json",
        "format": "gemini-settings",
        "events": {
          "TurnStart": "BeforeAgent",
          "TurnEnd": "AfterAgent",
          "ToolBefore": "BeforeTool",
          "ToolAfter": "AfterTool",
          "ApprovalNeeded": "Notification",
          "Idle": "Notification",
          "Compacting": "PreCompress",
          "SessionStart": "SessionStart"
        },
        "notificationFilter": { "ApprovalNeeded": "permission_prompt", "Idle": "idle_prompt" }
      },
      "transcriptFormat": "gemini-jsonl"
    }
  }
}
```

User additions look the same with arbitrary `id`, `icon: "bot"` (or any icon name not in the built-in set falls back to the bot icon), and a `hookConfig` they can fill in or leave null. If `hookConfig` is null, the runtime is launchable but operates in **outbound-disabled mode** — presence won't come online, telemetry won't populate, and control commands work only via direct send-keys (no slash-via-hook fallback). The UI shows a "hooks not configured" hint with a link to docs.

Optional fields: `env: Record<string, string>` (set in the runtime's shell), `args: string[]` (extra CLI args before `send-keys` kicks in), `contextWindow: { default: number, perModel?: Record<string, number> }` (token caps for `context_pct` derivation; falls back to a kernel-shipped table when absent).

### `.f-mark/agents/<participant_id>/` (extends auto-stream-hook plan)

Per-agent directory created on first managed spawn or first `link` POST.

```
.f-mark/agents/ag-claude/
├── active-session         # plaintext: session id (already in auto-stream plan)
├── .supervisor.lock       # flock'd by supervisor daemon
├── supervisor.pid         # supervisor's own pid (for ops/debug)
├── tmux-session           # plaintext: F-Mark tmux session name (only if managed)
├── runtime                # plaintext: runtime_id (only if managed; sourced from RuntimeRegistry)
├── telemetry.json         # latest telemetry snapshot (context_pct, last_tool, ...)
└── .events/               # incoming hook event JSON drops, consumed by supervisor
    └── 20260523T143012Z_pretooluse_abc123.json
```

The `tmux-session` and `runtime` files are how the kernel re-identifies managed agents during reconcile-on-startup.

### Tmux Session Naming Convention

All F-Mark-owned sessions are prefixed `fmark-`. The full pattern:

- Agent sessions: `fmark-<projectSlug>-ag-<participantId>`
  Example: `fmark-acme-billing-ag-claude-1a2b`
- Terminal sessions: `fmark-<projectSlug>-term-<index>`
  Example: `fmark-acme-billing-term-2`

`projectSlug` is derived from the absolute project root path via the same `normalizeSlug` already in `packages/kernel/src/sessions.ts`, applied to the final path segment. Collisions across projects are deliberately possible — they're harmless because the kernel only ever reconciles sessions whose pane CWD matches its own project root (checked via `tmux display-message -t <session> -p "#{pane_current_path}"`).

### Participant Model — No Schema Change

We deliberately do **not** add presence to `config.json`. Presence is in-memory in the kernel, broadcast over WS, and rebuilt from heartbeats on kernel restart. This keeps the participant record stable across crashes (a participant is never "lost," only its current online state).

## Kernel HTTP Routes

All under standard `Bearer <token>` auth. New routes:

### Managed Agents

- **`POST /managed-agents/spawn`**
  Body: `{ runtime_id, session_id, name?, suggested_participant_id? }`
  Behavior: register participant if `suggested_id` doesn't exist (reusing existing `participants.ts`), create tmux session, spawn runtime with hook config injected into the runtime's settings file (Claude `settings.json`, Codex `config.toml`, Gemini equivalent — these are no-ops on subsequent spawns if already present), wait `readyDelayMs`, render guide markdown via `GET /guide?agent_id=...&session_id=...` (internal call), `tmux send-keys` it. Returns `{ participant_id, tmux_session, runtime_id }`.

- **`DELETE /managed-agents/:participant_id`**
  The "say goodbye" action. Kills the tmux session (`tmux kill-session -t ...`), removes `.f-mark/agents/<id>/`, broadcasts a presence-offline event. **Does not** delete the participant record itself — only the managed lifecycle. (Participant rename / removal stays in the existing `/participants/:id` PATCH.)

- **`POST /managed-agents/terminal`**
  Body: `{ name? }`
  Creates a `fmark-<proj>-term-<n>` tmux session running just `$SHELL` in the project CWD. Returns `{ tmux_session, label }`.

- **`GET /managed-agents`**
  Returns `{ agents: [...], terminals: [...] }`. Each item: `{ tmux_session, participant_id?, runtime_id?, label, created_at }`. Agent items have participant_id + runtime_id; terminal items have just label. Computed live from `tmux ls` + `.f-mark/agents/*/` directory scan.

### Presence

- **`POST /agents/:participant_id/link`**
  (Already in auto-stream-hook plan.) Writes `.f-mark/agents/<id>/active-session` to the kernel's currently-pointed session. Idempotent.

- **`POST /agents/:participant_id/unlink`**
  Clears `active-session`. Flips presence offline. Supervisor POSTs this on death.

- **`POST /agents/:participant_id/heartbeat`**
  Updates the in-memory `lastSeen` map. If absent (kernel just started), implicit `link` happens. Broadcasts an online event if state changed.

### Control & Telemetry

- **`POST /agents/:participant_id/telemetry`**
  Body: `{ context_pct?, last_tool?, awaiting_approval?, idle_state?, model?, tokens_used?, tokens_total? }`. Partial updates accepted; kernel merges into `.f-mark/agents/<id>/telemetry.json` and broadcasts `{ type: "telemetry", participant_id, ...patch }` over WS. Supervisor calls this on every transcript change and on `ApprovalNeeded` / `Idle` hook events.

- **`GET /agents/:participant_id/telemetry`**
  Returns the latest telemetry snapshot. Used on UI startup to seed before WS events arrive.

- **`POST /managed-agents/:participant_id/command`**
  Body: one of
  - `{ type: "slash", command: "compact" }` — sends `/compact` Enter
  - `{ type: "slash", command: <any> }` — generic slash-command injection
  - `{ type: "interrupt" }` — sends Ctrl-C
  - `{ type: "message", text: <string> }` — sends free text + Enter

  Resolves the agent's tmux session via `.f-mark/agents/<id>/tmux-session` and invokes `tmux send-keys -t <session> -- <payload>`. Returns `200` on success, `409 { reason: "unmanaged_pane", offer: "open_overlay" }` if the agent has no F-Mark-owned pane, `404` if participant doesn't exist or is offline.

### Environment Probe

- **`GET /env-probe`**
  Returns `{ tmux: bool, runtimes: Record<runtime_id, bool>, installer: string | null, os: string }`. `installer` is one of `apt | brew | port | dnf | yum | zypper | wsl | null`. Probe is cheap (`which` calls); cached for 30s in-memory.

- **`POST /env/install`**
  Body: `{ package: string }`
  Runs the appropriate installer command for `package` (e.g., `tmux`) inside a managed terminal pane so the user can see progress. Returns `{ tmux_session }` (the pane being used for the install). The renderer attaches via the terminal overlay to show output. On exit, the kernel re-runs the probe and broadcasts new env state.

  **This route + its UI is the `delegate-to-subagent` chunk** (see implementation phasing below).

### Guide

- **`GET /guide?agent_id=<id>&session_id=<id>`**
  Both params optional. Without params: returns the generic onboarding markdown (current behavior). With `agent_id`: injects "You are participant `<id>`. Use that participant id for all POSTs." With `session_id`: injects "Active session is `<id>`. Start your loop with `GET /sessions/<id>/events?since=`." With both: full kickoff. Always includes the kernel URL + token (or notes `--no-auth` if applicable).

### Hook Installer

- **`GET /managed-agents/hook-install-status?runtime_id=<id>`**
  Returns `{ installed: bool, configPath: string, hooksPresent: string[], hooksMissing: string[] }`. The renderer uses this to decide whether to prompt the user before a first spawn.

- **`POST /managed-agents/hook-install`**
  Body: `{ runtime_id, confirm: true }`. Merges F-Mark's hooks into the runtime's config file (`hookConfig.path` from registry). Format-specific: for `claude-settings` and `gemini-settings` we read+write JSON; for `codex-toml` we read+write TOML preserving comments where possible. Backs up the original to `<configPath>.fmark-backup-<ts>` before writing. Returns `{ installed: true, backupPath }`. Idempotent (re-running is safe).

- **`POST /managed-agents/hook-uninstall`**
  Body: `{ runtime_id, confirm: true }`. Removes only the hooks F-Mark installed (matched by their `command` containing `f-mark hook ensure-supervisor`). Untouchable hooks the user added themselves.

## WebSocket Channels

Existing bus pattern (`packages/kernel/src/ws/bus.ts`) is extended with two new channel types:

### `pane.<tmux_session>` — terminal piping

- **Subscribe:** client sends `{ type: "subscribe", channel: "pane.fmark-acme-ag-claude-1a2b" }`.
  Server's onSubscribe handler runs `tmux capture-pane -t <session> -p -e -J -S -2000` (last 2000 lines, with escape sequences, joined) and sends the snapshot as `{ type: "pane.snapshot", data: <ansi-string> }`. Then starts a `tmux pipe-pane` to a per-subscriber fifo and pipes lines as `{ type: "pane.data", data: <chunk> }`.
- **Input:** client sends `{ type: "pane.input", data: <keystrokes> }`. Server runs `tmux send-keys -t <session> -- <keystrokes>`. Special keys (Enter, Ctrl-C) sent as escape sequences and translated to `send-keys` arguments (`C-m`, `C-c`).
- **Unsubscribe / disconnect:** server kills its `pipe-pane`. Other subscribers unaffected.

Multiple subscribers per pane are allowed — they share the snapshot but each gets its own pipe. Input from any subscriber goes to the same pane (no per-client mute; this is intentional for "show your collaborator what's happening").

### Presence events (existing bus, new message type)

- `{ type: "presence", participant_id, online: bool, last_seen: <iso8601> }` broadcast on link/unlink/heartbeat-state-change.

### Telemetry events (existing bus, new message type)

- `{ type: "telemetry", participant_id, patch: { context_pct?, last_tool?, awaiting_approval?, idle_state?, model?, tokens_used?, tokens_total? } }` broadcast on every supervisor telemetry POST. Renderer merges into a per-participant telemetry slice and refreshes the agent chip + any open detail UI.

### Reconnect events (existing bus, new message type)

- `{ type: "managed-agent.spawned", participant_id, tmux_session, runtime_id }` on spawn.
- `{ type: "managed-agent.killed", participant_id }` on goodbye.
- `{ type: "managed-agent.terminal-spawned", tmux_session, label }`.
- `{ type: "env-probe.updated", result: <EnvProbeResult> }` after install or manual re-probe.
- `{ type: "hook-install.completed", runtime_id, backupPath }` after a successful hook install/uninstall.

## Renderer UI

### Top Bar — Agent + Terminal Chips

Existing top-bar real estate gets a horizontally-scrolling row of chips. Each chip is one of:

- **Agent chip:** runtime icon, participant name, and a small radial telemetry indicator wrapping the icon:
  - **Outer ring:** presence color (green=online, gray=offline, amber=awaiting_approval, blue=thinking).
  - **Inner arc:** `context_pct` filled clockwise (0–100%); turns amber above 75%, red above 90%.
  - **Center pulse:** subtle animation when `last_tool` is set and unresolved (signals "tool running").

  Hover/click reveals telemetry tooltip with full state (model, tokens, last_tool name, idle duration). Click opens the action menu (see below).
- **Terminal chip:** terminal-monitor icon, `terminal <n>` label. Click opens action menu (rename / kill / open terminal).
- **`+` button:** trailing chip with `+` icon. Click opens dropdown with: Claude, Codex, Gemini (icons from registry), separator, Terminal (terminal-monitor icon), separator, "Manage runtimes…" (jumps to Settings).

Agents that have been "promoted" from terminals (user ran `claude` inside `terminal 2` and the hook fired) get a small secondary badge on their chip showing the source terminal label. Hovering tells the full story.

### Agent Action Menu

Triggered by clicking an agent chip. Items, all rendering as disabled/grayed-with-tooltip when the runtime or pane state makes them unavailable:

- **Rename** — inline edit of `participant.name`.
- **Send `/compact`** — `POST /managed-agents/:id/command { type: "slash", command: "compact" }`. Disabled with tooltip "Pane not managed by F-Mark" for un-managed agents (offers "Open in overlay" to adopt). Disabled with tooltip "Awaiting approval — clear that first" while `awaiting_approval` is true.
- **Send `/clear`** / **Send `/resume`** — same shape; sub-items under "Slash commands…".
- **Interrupt (Ctrl-C)** — `{ type: "interrupt" }`. Disabled if offline.
- **Send a message…** — opens an inline text input below the menu. Submit POSTs `{ type: "message", text }`. Used to nudge the agent without leaving F-Mark.
- **Open terminal** — opens the Terminal Overlay focused on this agent's pane.
- **Reconnect** — only when offline; opens Reconnect Modal.
- **Say goodbye** — kills the tmux session + clears `.f-mark/agents/<id>/`; confirmation token gated (see Security Model).

### Terminal Overlay Modal

Single full-screen-ish modal (similar to existing CmdK / Settings modal patterns) hosting an xterm.js terminal. Features:

- Connects to the `pane.<session>` WS channel on open, populates with snapshot, then streams.
- Input box → keystrokes sent to pane.
- Tab strip across the top: if the project has multiple open agent/terminal panes, user can switch between them without closing the modal.
- "Detach" closes the modal but leaves the tmux session alive. "Say goodbye" (agents only) or "Kill terminal" sends the destroy action.
- Resize: forwards size changes via `tmux resize-window -t <session> -x <cols> -y <rows>`.

### Reconnect Modal

Shown when user clicks "Reconnect" on an offline agent chip. Renders the response of `GET /guide?agent_id=<id>&session_id=<currentSession>` as markdown (using the renderer's existing markdown card), with a prominent **Copy launch command** button. Below the command: a short note explaining "Or open a Terminal here and paste it — I'll detect the connection automatically."

### Hook Install Prompt

Shown before the user's first `+` spawn for a given runtime on this machine, gated by `GET /managed-agents/hook-install-status`. Modal copy:

> **Install F-Mark hooks for Claude Code?**
> F-Mark needs to add four entries to `~/.claude/settings.json` so it can see Claude's events. We'll back up your current settings to `settings.json.fmark-backup-<ts>`.
> [Show diff] [Install] [Cancel]

The diff panel renders the precise JSON / TOML insertion the kernel will make. "Cancel" downgrades the spawn to outbound-disabled mode (telemetry won't populate) and remembers the decision via a small `~/.f-mark/preferences.json` so we don't re-prompt every spawn.

Settings → Connected Agents has a "Hooks" row per registered runtime showing `installed | not installed | partial | declined` with an install/uninstall button.

### Settings → Connected Agents

Existing modal section (`packages/renderer/src/modals/settings/Agents.tsx`) gets:

- The existing "Invite new agent" affordance stays — that path is for **un-managed** agents (a participant id without a managed tmux session). Renamed in copy to "Register agent (no spawn)" to distinguish.
- New section: **Manage Runtimes**. Table of registered runtimes (icon, displayName, command, readyDelayMs, type=builtin/custom). Edit + remove for custom; commands editable for builtins (so `claude` can become `claude --model haiku` if the user wants). Add button → form with all the fields, icon picker (built-in icons + bot fallback).

### Environment Probe Banner

A small status strip beneath the top bar. Shown when `GET /env-probe` reports `tmux: false` OR any registered runtime missing. Two states:

- **Missing tmux:** banner reads "Tmux not installed — managed agents disabled." with **Install tmux** button.
  - If `installer` is non-null, clicking opens the Terminal Overlay running the install command (e.g., `sudo apt install -y tmux` for apt). On exit, kernel re-probes.
  - If `installer` is null, button text becomes "Install Homebrew" (or appropriate native installer for OS), opens Terminal Overlay running the install one-liner for that installer. After install, banner cycles to the tmux variant.
- **Missing runtime(s):** banner reads "X is not on PATH — its `+` option will be disabled." with a runtime list. No install button (we don't know how to install third-party agent CLIs reliably — user handles).

When the banner is shown, the `+` dropdown is rendered but unavailable runtimes are grayed out with their probe failure as tooltip. The Terminal option remains available (the install flow uses it).

## Environment Probe + Installer Flow

Tagged `delegate-to-subagent` in the implementation plan. The kernel side is small (`/env-probe`, `/env/install`); the heuristic logic to detect installers across distros + chained "install installer first" UX is the gnarly part. A subagent gets a self-contained brief covering:

- Installer detection priority: `brew` (macOS), then `apt`/`dnf`/`yum`/`zypper`/`pacman`/`port` (Linux), then WSL probe via `wsl.exe -l` (Windows).
- Per-installer tmux install command lookup table.
- Per-OS "install the installer" fallback (e.g., on macOS without brew: render the one-liner from brew.sh; on raw Windows: link to WSL installation docs).
- Terminal Overlay integration (re-uses the existing pane-WS to show install output; no new UI needed beyond the banner button).
- Re-probe and broadcast on exit.

## Auto-Stream-Hook Plan Refactor

The existing `docs/superpowers/plans/2026-05-23-auto-stream-hook.md` is in-flight but unstarted (working tree has untracked `packages/kernel/tests/events/toolUse-types.test.ts` and a modified `packages/shared/src/events.ts` — Phase 1 Task 1 work). This spec refactors that plan, but does not invalidate it: phases 1–4 (shared types, kernel routes for `/events/tool-use`, prose `arbitrary` flag) stay verbatim.

What changes:

- **Phase 5 (originally "build the hook subcommand").** Replaced with two subcommands:
  - `f-mark hook ensure-supervisor <agent_id>` — tiny, flock'd, spawns the daemon detached if not already running. Idempotent. Used by all hook events (Stop, UserPromptSubmit, PreToolUse, PostToolUse).
  - `f-mark hook supervisor <agent_id> <agent_pid>` — the daemon. Contains the transcript-watching, parsing, and POST logic the original plan distributed across per-Stop fires. Plus the new heartbeat loop and death detection.

- **Phase 6 (renderer cards).** Unchanged — `ToolUseCard`, `ArbitraryGroupCard`, `EventCard` dispatch all work identically since the events themselves are unchanged.

- **Phase 7-8 (Codex / Gemini skill bundles).** Hook command in their settings becomes `f-mark hook ensure-supervisor <agent_id>` instead of the per-Stop transcript parser. Cleaner one-liner.

- **Phase 9 (testing).** Tests reorganize: supervisor daemon gets its own test file with the transcript-watcher logic; ensure-supervisor gets a tiny test for the flock idempotency; the per-Stop tests fold into the supervisor's transcript-watcher tests.

The refactor is captured in a new section of the existing plan rather than a parallel plan — we don't want two planning documents in disagreement. The new spec (this document) becomes the source of truth; the auto-stream plan is amended with a "Note: Phases 5, 7, 8, 9 are restructured per `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md`" pointer.

## Reconcile on Startup

When the kernel starts:

1. **List candidate sessions:** `tmux ls -F '#{session_name}'` filtered to `^fmark-<projectSlug>-`. Skip if `tmux` itself isn't installed (env probe will surface this).
2. **For each session, verify ownership:** check that the pane's CWD matches the kernel's project root (`tmux display-message -t <s> -p "#{pane_current_path}"`). Drop mismatches — they're another project's sessions sharing the slug.
3. **Cross-reference with `.f-mark/agents/*/`:**
   - Agent dir exists + tmux session exists → "managed agent, resurrect presence" — set in-memory state to offline (we have no heartbeat yet), broadcast nothing yet. When the surviving supervisor's next heartbeat arrives (~15s window), presence will flip online naturally.
   - Agent dir exists + tmux session gone → "managed agent crashed during kernel downtime" — log it, clear the dir, broadcast offline + show in UI with a flagged reconnect prompt.
   - Tmux session exists + no agent dir → either a terminal session (whose label is in the session name) or an agent whose pointer was deleted. Add to the terminals list; user can re-promote manually.
4. **Re-attach pipe-pane** is unnecessary — pipe-pane is per-subscriber, set up lazily when the renderer subscribes to `pane.<id>`.

Reconcile completes in <100ms for a reasonable session count and is non-blocking on the request path.

## Security Model

- **Auth required.** All new routes use the existing `registerAuthHook` bearer-token gate. `--no-auth` disables the gate as today; this means anyone on localhost (or whoever you've forwarded the port to) can spawn processes. The startup banner gains a warning when `--no-auth` is combined with any spawn capability — exact copy: "Warning: --no-auth allows any client on this port to spawn processes via the managed-agents API."
- **Spawn target is always the kernel host.** `--remote` and `--container` modes spawn on the remote / container host respectively. This is intentional and matches the kernel's project-root model. The env-probe surfaces missing prerequisites; users see what's installable.
- **No shell injection surface.** Runtime config `command` is split on whitespace into argv and passed to `tmux new-session` as separate args, not through a shell. Initial-prompt content is delivered via `tmux send-keys` with `--` separator; no eval, no expansion. The installer route is the exception — it intentionally runs a shell — and lives behind the `delegate-to-subagent` tag where extra care is documented.
- **`DELETE /managed-agents/:id`** requires a `confirm=<random-token>` query param matching a value the renderer fetched via `GET /managed-agents/:id/confirm-token` (single-use, in-memory, 10s TTL). Prevents accidental kills from misfired requests.

## Phased Implementation Outline

Detailed step-by-step lives in the implementation plan (created via `writing-plans` after this spec is approved). The phasing is:

1. **Phase 1 — Tmux Manager (no UI).** Pure module: spawn, list, kill, capture-pane, send-keys, pipe-pane. Vitest with an injectable command runner (no actual tmux required in tests). Includes the session naming convention and ownership-verification helpers.
2. **Phase 2 — Runtime Registry (incl. hookConfig).** `.f-mark/runtimes.json` loader, defaults writer (called from `initProject`), CRUD operations. Tests for parsing, defaults, and round-tripping custom entries. Defaults include the full `hookConfig` per built-in runtime.
3. **Phase 3 — Supervisor Daemon + auto-stream-hook refactor + telemetry.** `f-mark hook supervisor` and `f-mark hook ensure-supervisor` subcommands. Replaces the auto-stream plan's Phase 5. Heartbeat + transcript-watch + death-detect + telemetry derivation (`context_pct` from transcript, `last_tool` from event queue, `awaiting_approval` / `idle_state` from hook events). Per-runtime transcript-format parsers live here.
4. **Phase 4 — Managed-agents HTTP routes (incl. command + telemetry).** `POST /managed-agents/spawn`, `DELETE`, terminal spawn, list, link/unlink/heartbeat, `POST /agents/:id/telemetry`, `POST /managed-agents/:id/command`.
5. **Phase 5 — Pane WS channel.** `pane.<id>` subscribe/data/input/snapshot. Server-side `pipe-pane` lifecycle.
6. **Phase 6 — Hook Installer.** `hook-install-status`, `hook-install`, `hook-uninstall` routes + format adapters (claude-settings JSON, codex-toml, gemini-settings JSON). Backup-before-write. UI is part of Phase 7.
7. **Phase 7 — Renderer: top-bar chips with telemetry indicator, agent menu (incl. compact/interrupt/message), + button, terminal overlay, Hook Install Prompt, Reconnect Modal.** Wires to all of the above. xterm.js integration in the overlay.
8. **Phase 8 — Reconcile on startup.** The kernel boot path scans tmux and rebuilds state, including telemetry from `.f-mark/agents/*/telemetry.json` snapshots.
9. **Phase 9 — Guide endpoint extension.** Query-param-driven substitution.
10. **Phase 10 — Env probe + installer flow.** **`delegate-to-subagent`.** Heuristics, Linux/macOS/WSL detection, install commands, banner UI, re-probe.
11. **Phase 11 — Settings → Manage Runtimes UI.** Add/edit/remove for custom; edit-only for builtin command strings; icon picker; hookConfig fields exposed for power users.
12. **Phase 12 — Docs + skill bundle updates.** README, AGENT.md, skill bundles for the three runtimes mention the orchestrated-spawn path, the supervisor-daemon-driven presence model, and the control plane.

## Testing Strategy

- **Pure functions get unit tests.** Tmux session naming/parsing, ownership verification, runtime config parsing, transcript-walking, token-counting per runtime transcript format, hook-event-to-telemetry translation, hook-config format adapters (claude-settings JSON, codex-toml, gemini-settings JSON read/write).
- **CLI subcommands get integration tests with mocked `fetch` and an injectable command runner.** The supervisor daemon's loop is testable without spawning a real process — pass in a fake pid + a controllable `aliveCheck` function + a fixture transcript file you can mutate to drive telemetry transitions.
- **HTTP routes get Fastify-inject tests** following the existing convention in `packages/kernel/tests/routes/`. Tmux command runner is injected; no actual tmux required. Includes `POST /managed-agents/:id/command` (all three command types) and `POST /agents/:id/telemetry`.
- **Hook installer adapter tests** round-trip realistic config fixtures for all three runtimes, including backup creation, idempotent re-install, partial-state detection, and uninstall preserving user-added hooks.
- **WS pane channel** gets a unit test that simulates subscribe → snapshot → data → input, asserting the right `tmux capture-pane` / `pipe-pane` / `send-keys` invocations land on the runner. Telemetry-event broadcast tests assert WS payload shape.
- **Renderer components get RTL tests** for the chip row (including telemetry ring + tool-running pulse), action menus (incl. disabled-state tooltips when commands aren't available), the `+` dropdown, the terminal overlay (xterm.js mocked to a stub), Hook Install Prompt, and the reconnect modal.
- **Reconcile-on-startup gets an integration test** with a fixture of fake tmux sessions + agent dirs covering the three reconcile cases, including pre-existing `telemetry.json` snapshots being restored to in-memory state.
- **Per-runtime transcript fixtures** for Claude/Codex/Gemini live in `packages/kernel/tests/fixtures/transcripts/` so the daemon's transcript parsers can be tested against realistic input without spawning the runtimes.
- **No end-to-end test against real tmux or real runtimes in CI** — the cost/flake tradeoff isn't worth it. We document a manual smoke-test checklist per runtime for releases.

## Out of Scope / Future Work

- **Multi-machine fleet orchestration.** Could be layered later as a "remote spawn target" runtime config field (`host: "user@machine"`); deferred.
- **Per-pane recording / replay.** Capture-pane gives us scrollback but no time-series record. Future: optionally archive `pipe-pane` output to disk for later replay in the renderer.
- **Auto-restart on agent crash.** Currently the supervisor dies with the agent and the user has to reconnect. A `restartPolicy: "on-failure"` could be added per-runtime.
- **Permission-scoped tokens.** Today all clients see all managed agents. A future enhancement could scope tokens to specific participant ids (useful for shared-team kernels).
- **Programmatic approval responses.** F-Mark detects `awaiting_approval` but doesn't yet let the user approve/deny from the UI — they still have to switch to the agent's pane (via overlay) and type yes/no. Approve-from-UI would require either runtime-specific RPC (not currently exposed) or send-keys'ing the answer, which is brittle. Defer until a runtime exposes a proper approve/deny RPC.
- **Permission-prompt grouping for multi-agent sessions.** When several agents are awaiting approval at once, the UI shows them independently. A future enhancement could surface a single "approvals queue" panel.
- **Slash-command-via-RPC.** If a runtime ever exposes external slash-command invocation (no current evidence), we'd switch from send-keys to the cleaner RPC. Send-keys remains a fallback for older versions.

---

## Decision Summary

| Decision | Chosen | Rationale |
|---|---|---|
| Runtime model | Generic data-driven adapter (`.f-mark/runtimes.json`) | Adding a runtime should never be a code change. |
| Lifecycle on kernel exit | Detach (tmux sessions survive) | Justifies tmux choice; agent context survives kernel restarts and updates. |
| Presence detection | Hook-driven via supervisor daemon | Decouples identity from tmux ownership; works for both managed and manual agents. |
| Supervisor daemon location | Standalone Node process (A1) | Survives kernel restart by construction; kernel stays a pure HTTP receiver. |
| Browser terminal transport | `tmux pipe-pane` + WS (B1) | No native dep; tmux primitives map cleanly to WS messages. |
| Env-mode availability | All modes; probe-and-banner approach | Remote dev VM is a real workflow; honesty about prerequisites beats lockdown. |
| Tmux dependency | Hard dep on Linux/macOS; WSL on Windows | Acceptable platform constraint for this feature. |
| Auto-stream-hook plan | Refactored, not replaced | Phases 1–4 unchanged; phases 5/7/8/9 restructured around the supervisor model. |
| Installer flow | Delegated to subagent during implementation | Heuristic-heavy, self-contained; benefits from focused brief. |
| Inbound control transport (kernel→agent) | `tmux send-keys` for managed panes; 409 + offer-overlay for un-managed | Universal — none of the three runtimes expose external action-trigger APIs. |
| Outbound telemetry derivation | Hook events + transcript parsing inside supervisor | Hooks miss live token counts; transcript parsing fills the gap. |
| Hook installation | Explicit one-time consent prompt, idempotent merge, backup-before-write | F-Mark modifying `~/.claude/settings.json` requires explicit user buy-in. |
| Awaiting-approval UI surfacing | Detect via hooks (Notification / PermissionRequest), display badge, do NOT auto-respond | No runtime exposes programmatic approve/deny; sending y/n via send-keys is brittle. |
| Per-runtime capability honesty | Disabled menu items with explanation tooltips | Pretending Codex has idle detection (when it doesn't) creates confusing UX. |

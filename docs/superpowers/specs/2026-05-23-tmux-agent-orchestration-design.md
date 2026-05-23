# Tmux-Orchestrated Agent Sessions — Design Spec

> **For agentic workers:** This is the design source-of-truth for the agent-orchestration feature. The implementation plan derived from this spec lives in `docs/superpowers/plans/` (created by `writing-plans` after spec approval). This document captures decisions and architecture, not per-task implementation steps.

## Summary

Add a process-orchestration layer to the F-Mark kernel so the user can spawn, supervise, and surface agent CLIs (Claude Code, Codex, Gemini, or any custom runtime) directly from the F-Mark UI. The kernel owns detached tmux sessions for managed agents and plain terminal panes; in-browser xterm.js overlays give the user manual control of any pane. Presence (online/offline) is driven by a daemon supervisor spawned by the agent's auto-stream hook — independent of model activity, decoupled from tmux ownership — so the same presence machinery works for both F-Mark-managed and user-launched agents. This spec also absorbs and supersedes the in-flight `2026-05-23-auto-stream-hook.md` plan; that plan's per-Stop transcript parsing collapses into the supervisor daemon.

## Goals

1. **One-click agent spinup.** A `+` button in the top bar offers Claude / Codex / Gemini / Terminal. Clicking any of the first three spawns a managed tmux session with the runtime pre-loaded, the active-session pointer pre-wired, the auto-stream hook installed, and the initial onboarding prompt sent to the REPL via `tmux send-keys`. Zero terminal context-switching for the user.
2. **Kernel-managed agent lifecycle.** The kernel knows about every managed agent — list, kill (the "say goodbye" action), rename, open-terminal-overlay. Tmux sessions survive kernel restarts (detached); on next kernel start the kernel reconciles surviving sessions and presence resumes naturally.
3. **Multi-agent orchestration.** Multiple managed agents can run concurrently against the same F-Mark session (the event log is already append-only and participant-aware). Terminal panes are first-class peers, listed alongside agents in the top bar; if a user types `claude` inside a terminal pane and the auto-stream hook fires, the participant appears in the agents list automatically — same tmux session, now with agent metadata.

## Non-Goals

- **Multi-machine orchestration.** Spawn always targets the kernel's host machine. `--remote` mode targets the SSH'd-into box; `--container` targets the container; cross-machine fleet management is out of scope.
- **Coordinating turn-taking between concurrent agents.** The event log is append-only and tolerates concurrent writers; we do not add scheduling, locking, or fairness primitives. Two agents posting at once will interleave by timestamp.
- **Windows without WSL.** Tmux is the chosen transport. Windows users go through WSL (which the environment probe will detect).
- **Replacing the existing AGENT.md / SKILL.md docs.** Those still drive the agent-side protocol. This spec only adds the orchestration layer above them.

## Architecture Overview

Five new logical pieces, all additive — no existing event-log or participant semantics change.

1. **Tmux Manager** (kernel module, `packages/kernel/src/tmux/`).
   Owns tmux session creation, naming, listing, killing, and reconciliation. Knows the F-Mark naming convention. Spawns the runtime CLI inside the new session and uses `tmux send-keys` to deliver the kickoff prompt after a runtime-specific ready delay. Identity-agnostic: works for agent sessions and bare terminal sessions identically.

2. **Runtime Registry** (kernel module + per-project config file, `.f-mark/runtimes.json`).
   Data-driven catalog mapping `runtime_id → { displayName, command, icon, readyDelayMs, env?, args? }`. Ships with `claude`, `codex`, `gemini` defaults. Users add custom runtimes via Settings → Connected Agents → Manage Runtimes. Custom runtimes render with a generic bot icon if no built-in icon matches.

3. **Supervisor Daemon** (kernel CLI subcommand, `f-mark hook supervisor`).
   Detached Node process spawned by the agent's auto-stream hook on first fire. Single instance per `agent_id` (flock'd at `.f-mark/agents/<id>/.supervisor.lock`). Owns three responsibilities for the agent's lifetime:
   - **Heartbeat:** POST `/agents/:id/heartbeat` every ~15s.
   - **Transcript streaming:** watch the runtime's JSONL transcript via `fs.watch` and POST new turns as `tool-use` / `prose` (arbitrary + concluding) events in order.
   - **Death detection:** poll `kill -0 <agent_pid>` between heartbeats; on failure, POST `/agents/:id/unlink` and exit.

   **This component subsumes the work the in-flight `2026-05-23-auto-stream-hook.md` plan distributes across each Stop hook fire.** That plan is refactored (see "Auto-Stream-Hook Plan Refactor" below).

4. **Presence / Terminal API** (kernel HTTP routes + WS channels, `packages/kernel/src/routes/managed-agents.ts`, `packages/kernel/src/ws/pane.ts`).
   HTTP endpoints for spawn / kill / list-managed / link / unlink / heartbeat. WebSocket channels: `pane.<tmux_session_id>` (terminal piping) and presence events on the existing bus.

5. **Guide Endpoint Extension** (`GET /guide?agent_id=<id>&session_id=<id>`).
   Existing `/guide` route extended to accept query params and substitute them into a tailored onboarding markdown. Used by:
   - The renderer's "Reconnect" modal (shown for offline agents) — user copies the rendered command and pastes into wherever they're launching from.
   - The kernel's own auto-launch flow — same renderer builds the `tmux send-keys` payload pushed into a freshly-spawned managed pane. Single source of truth for "how an agent joins F-Mark."

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
      "readyDelayMs": 2000
    },
    "codex": {
      "displayName": "Codex",
      "command": "codex",
      "icon": "codex",
      "readyDelayMs": 1500
    },
    "gemini": {
      "displayName": "Gemini",
      "command": "gemini",
      "icon": "gemini",
      "readyDelayMs": 1500
    }
  }
}
```

User additions look the same with arbitrary `id` and `icon: "bot"` (or any icon name not in the built-in set falls back to the bot icon). Optional fields: `env: Record<string, string>` (set in the runtime's shell), `args: string[]` (extra CLI args before `send-keys` kicks in).

### `.f-mark/agents/<participant_id>/` (extends auto-stream-hook plan)

Per-agent directory created on first managed spawn or first `link` POST.

```
.f-mark/agents/ag-claude/
├── active-session         # plaintext: session id (already in auto-stream plan)
├── .supervisor.lock       # flock'd by supervisor daemon
├── supervisor.pid         # supervisor's own pid (for ops/debug)
├── tmux-session           # plaintext: F-Mark tmux session name (only if managed)
└── runtime                # plaintext: runtime_id (only if managed; sourced from RuntimeRegistry)
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

### Reconnect events (existing bus, new message type)

- `{ type: "managed-agent.spawned", participant_id, tmux_session, runtime_id }` on spawn.
- `{ type: "managed-agent.killed", participant_id }` on goodbye.
- `{ type: "managed-agent.terminal-spawned", tmux_session, label }`.
- `{ type: "env-probe.updated", result: <EnvProbeResult> }` after install or manual re-probe.

## Renderer UI

### Top Bar — Agent + Terminal Chips

Existing top-bar real estate gets a horizontally-scrolling row of chips. Each chip is one of:

- **Agent chip:** colored dot (presence: green=online, gray=offline), runtime icon, participant name. Click opens action menu (rename / say goodbye / open terminal / reconnect-if-offline).
- **Terminal chip:** terminal-monitor icon, `terminal <n>` label. Click opens action menu (rename / kill / open terminal).
- **`+` button:** trailing chip with `+` icon. Click opens dropdown with: Claude, Codex, Gemini (icons from registry), separator, Terminal (terminal-monitor icon), separator, "Manage runtimes…" (jumps to Settings).

Agents that have been "promoted" from terminals (user ran `claude` inside `terminal 2` and the hook fired) get a small secondary badge on their chip showing the source terminal label. Hovering tells the full story.

### Terminal Overlay Modal

Single full-screen-ish modal (similar to existing CmdK / Settings modal patterns) hosting an xterm.js terminal. Features:

- Connects to the `pane.<session>` WS channel on open, populates with snapshot, then streams.
- Input box → keystrokes sent to pane.
- Tab strip across the top: if the project has multiple open agent/terminal panes, user can switch between them without closing the modal.
- "Detach" closes the modal but leaves the tmux session alive. "Say goodbye" (agents only) or "Kill terminal" sends the destroy action.
- Resize: forwards size changes via `tmux resize-window -t <session> -x <cols> -y <rows>`.

### Reconnect Modal

Shown when user clicks "Reconnect" on an offline agent chip. Renders the response of `GET /guide?agent_id=<id>&session_id=<currentSession>` as markdown (using the renderer's existing markdown card), with a prominent **Copy launch command** button. Below the command: a short note explaining "Or open a Terminal here and paste it — I'll detect the connection automatically."

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
2. **Phase 2 — Runtime Registry.** `.f-mark/runtimes.json` loader, defaults writer (called from `initProject`), CRUD operations. Tests for parsing, defaults, and round-tripping custom entries.
3. **Phase 3 — Supervisor Daemon + auto-stream-hook refactor.** `f-mark hook supervisor` and `f-mark hook ensure-supervisor` subcommands. Replaces the auto-stream plan's Phase 5. Heartbeat + transcript-watch + death-detect.
4. **Phase 4 — Managed-agents HTTP routes.** `POST /managed-agents/spawn`, `DELETE`, terminal spawn, list, link/unlink/heartbeat.
5. **Phase 5 — Pane WS channel.** `pane.<id>` subscribe/data/input/snapshot. Server-side `pipe-pane` lifecycle.
6. **Phase 6 — Renderer: top-bar chips, agent menu, + button, terminal overlay.** Wires to all of the above. xterm.js integration in the overlay.
7. **Phase 7 — Reconcile on startup.** The kernel boot path scans tmux and rebuilds state.
8. **Phase 8 — Guide endpoint extension + Reconnect modal.** Query-param-driven substitution + the renderer modal.
9. **Phase 9 — Env probe + installer flow.** **`delegate-to-subagent`.** Heuristics, Linux/macOS/WSL detection, install commands, banner UI, re-probe.
10. **Phase 10 — Settings → Manage Runtimes UI.** Add/edit/remove for custom; edit-only for builtin command strings; icon picker.
11. **Phase 11 — Docs + skill bundle updates.** README, AGENT.md, skill bundles for the three runtimes mention the orchestrated-spawn path and the supervisor-daemon-driven presence model.

## Testing Strategy

- **Pure functions get unit tests.** Tmux session naming/parsing, ownership verification logic, runtime config parsing, transcript-walking (lifted out of the daemon proper for direct testability).
- **CLI subcommands get integration tests with mocked `fetch` and an injectable command runner.** The supervisor daemon's loop is testable without spawning a real process — pass in a fake pid + a controllable `aliveCheck` function.
- **HTTP routes get Fastify-inject tests** following the existing convention in `packages/kernel/tests/routes/`. Tmux command runner is injected; no actual tmux required.
- **WS pane channel** gets a unit test that simulates subscribe → snapshot → data → input, asserting the right `tmux capture-pane` / `pipe-pane` / `send-keys` invocations land on the runner.
- **Renderer components get RTL tests** for the chip row, action menus, the `+` dropdown, the terminal overlay (xterm.js mocked to a stub), and the reconnect modal.
- **Reconcile-on-startup gets an integration test** with a fixture of fake tmux sessions + agent dirs covering the three reconcile cases.
- **No end-to-end test against real tmux in CI** — the cost/flake tradeoff isn't worth it. We do document a manual smoke-test checklist for releases.

## Out of Scope / Future Work

- **Multi-machine fleet orchestration.** Could be layered later as a "remote spawn target" runtime config field (`host: "user@machine"`); deferred.
- **Per-pane recording / replay.** Capture-pane gives us scrollback but no time-series record. Future: optionally archive `pipe-pane` output to disk for later replay in the renderer.
- **Auto-restart on agent crash.** Currently the supervisor dies with the agent and the user has to reconnect. A `restartPolicy: "on-failure"` could be added per-runtime.
- **Permission-scoped tokens.** Today all clients see all managed agents. A future enhancement could scope tokens to specific participant ids (useful for shared-team kernels).
- **Cross-runtime hook abstraction.** Codex and Gemini hook formats are runtime-specific; the user installs them once per machine. A future "f-mark doctor" command could install/verify hook configuration automatically.

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

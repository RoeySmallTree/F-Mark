# Tmux-Orchestrated Agent Sessions — Design Spec (v0.4 target)

> **For agentic workers:** This spec targets F-Mark **v0.4**. It evolves the **already-shipped v0.3.0 auto-stream hook** rather than replacing it. The implementation plan derived from this spec lives in `docs/superpowers/plans/` (created by `writing-plans` after spec approval). Captured-but-deferred work for v0.5 (hook installer + presence refinements + Codex structured events) and v0.6 (telemetry / context accounting) appears under "Future Work."

## Summary

Add a process-orchestration layer to the F-Mark kernel so the user can spawn, supervise, and surface agent CLIs (Claude Code, Codex, Gemini, or any custom runtime) directly from the F-Mark UI. The kernel owns detached tmux sessions for managed agents and plain terminal panes; an in-browser xterm.js overlay attaches to any pane.

The shipped v0.3.0 auto-stream hook path (Stop / UserPromptSubmit → `f-mark hook auto-stream <participant_id>`) is the **backbone** of how agents reach the kernel. This feature wraps tmux orchestration around that backbone — it does not replace it.

For v0.4: **presence = TTL + tmux liveness** (no long-lived supervisor daemon). For v0.4: **no telemetry derivation** beyond presence states — `context_pct`, `last_tool`, `awaiting_approval` and similar are deferred to v0.6 once per-runtime transcript fixtures and real test coverage exist. For v0.4: **hook installation = read-only detection + copyable manual instructions** (no automated rewrites of `~/.claude/settings.json` / `~/.codex/config.toml` / `~/.gemini/settings.json`).

Inbound control (kernel → agent) uses `tmux send-keys`, framed honestly as best-effort pane input — reliable for `interrupt` (Ctrl-C), idle-gated for slash commands and free text.

## Goals (v0.4)

1. **One-click agent spinup.** A `+` button in the top bar offers Claude / Codex / Gemini / Terminal. Clicking any of the first three spawns a managed tmux session pre-loaded with the runtime, in the project's working directory. The pane onboards the agent by either (a) showing the user copyable manual hook-install instructions tied to the spawned agent's participant id, or (b) — if hooks are already detected as installed — sending the kickoff prompt via `tmux send-keys`. Either way the user never leaves F-Mark.
2. **Kernel-managed agent lifecycle.** The kernel knows about every managed agent — list, kill (the "say goodbye" action), rename, open-terminal-overlay. Tmux sessions survive kernel restarts (detached); on next kernel start the kernel reconciles surviving sessions and presence resumes naturally.
3. **Multi-agent orchestration.** Multiple managed agents can run concurrently against the same F-Mark session (the event log is already append-only and participant-aware). Terminal panes are first-class peers, listed alongside agents in the top bar.

## Non-Goals (v0.4)

- **Supervisor daemon.** No long-lived hook-spawned daemon. Presence is derived from hook-fire TTL + tmux liveness. (Re-evaluate in v0.6 only if a concrete user-visible bug demands it — e.g., "manual agent should show online during a 45-minute silent planning turn.")
- **Token-derived telemetry** (`context_pct`, `tokens_used`, etc.) — defer to v0.6 with per-runtime transcript fixtures + smoke coverage as prerequisites.
- **Automatic hook installation.** v0.4 only *detects* whether hooks are present and renders manual install instructions tailored to the runtime + the spawned participant id.
- **Package-manager / OS-level installation flows.** v0.4 probes for `tmux` and the three runtimes; if missing, shows the install command for the user's package manager (apt/brew/etc.) as copyable text. No `POST /env/install` route in v0.4.
- **External slash-command RPC.** None of the three runtimes expose this. v0.4 uses send-keys with explicit best-effort framing.
- **Multi-machine fleet orchestration.** Spawn always targets the kernel's host machine.
- **Coordinating turn-taking between concurrent agents.** The event log is append-only and tolerates concurrent writers; we do not add scheduling, locking, or fairness primitives.
- **Windows without WSL.** Tmux is the chosen transport. Windows users go through WSL.

## Migration from v0.3.0

This is **purely additive** — no v0.3.0 functionality is removed or changed.

- `f-mark hook auto-stream <participant_id> [--kind assistant|user]` keeps working exactly as it does today. Existing users with hooks in `~/.claude/settings.json` notice nothing.
- The active-session pointer at `.f-mark/agents/<id>/active-session` keeps its current contract. We add **sibling files**, never modify the pointer's format.
- The Claude-shaped transcript parser in `packages/kernel/src/hooks/transcript.ts` is unchanged. Codex stays in "preview" mode for transcript projection (its current state). Gemini stays in manual-stream mode (its current state).
- Hook config files (`~/.claude/settings.json`, `~/.codex/config.toml`, `~/.gemini/settings.json`) are **not modified by v0.4**. The renderer surfaces copyable text the user pastes themselves.
- The kernel adds a new "managed-agent" concept layered on top of the existing participant model. A managed agent is *also* a regular participant — with a `tmux-session` sibling file pointing to its F-Mark-owned tmux session.

The one v0.3.0 piece that does change: `GET /guide` is extended (see §"Guide Endpoint Update" below). The shipped route accepts `sessionId` (camelCase) only and explicitly says "Hooks (NOT YET SHIPPED)." Both are corrected — `sessionId` stays as a backward-compatible alias, the hooks text is rewritten to point at the runtime-specific manual install instructions.

## Architecture Overview

Five new logical pieces; all additive.

1. **Tmux Manager** (`packages/kernel/src/tmux/`).
   Creates / lists / kills / attaches / verifies-ownership-of tmux sessions. Knows the F-Mark naming convention (see §"Tmux Session Naming"). Spawns the runtime CLI inside a fresh session and runs `tmux send-keys` for the per-pane input queue. Tested via an injectable command runner so no actual tmux is required for unit tests.

2. **Runtime Registry** (`packages/kernel/src/runtimes/`, per-project file `.f-mark/runtimes.json`).
   Data-driven catalog: `runtime_id → { displayName, executable, args, env?, icon, readyDelayMs }`. Ships defaults for `claude` / `codex` / `gemini` (written on `initProject()`). User additions appear via Settings → Connected Agents → Manage Runtimes; custom runtimes fall back to a generic bot icon. `executable` + `args[]` are separate fields (no whitespace-splitting of a `command` string).

3. **Presence Tracker** (`packages/kernel/src/presence/`).
   In-memory map of `participant_id → { lastHookAt, tmuxSession?, state }` updated by:
   - A new tiny endpoint that hook fires ping (`POST /agents/:id/ping`), augmenting v0.3.0's existing auto-stream POSTs with a single presence signal call.
   - The Tmux Manager's pane-liveness checks (`tmux ls | grep ...` + `display-message -p "#{pane_dead}"`) for managed agents.

   States: `online | stale | offline | launching | pane-dead`. (See §"Presence States" for the transition table.)

   Broadcasts state changes on the WS bus. No daemon. No flock files. No `kill -0`.

4. **Pane WS Subsystem** (`packages/kernel/src/ws/pane.ts`).
   New WS sub-channel router (the existing `ws/bus.ts` is a global broadcast and stays so for event-log notifications). Per-pane: **one** `tmux pipe-pane` to a single in-process buffer; all subscribed WS clients receive that stream. Pipe starts on first subscriber, stops after last unsubscribes. Input is via `tmux send-keys` through the per-pane input queue.

5. **Managed-Agent + Terminal API** (`packages/kernel/src/routes/managed-agents.ts`).
   HTTP endpoints for spawn / kill / list-managed / terminal-spawn / hook-install-status / per-pane input + command / per-agent logs / probe. (Detailed in §"Kernel HTTP Routes" below.) Plus `GET /guide` extension.

## Tmux Session Naming

All F-Mark-owned tmux sessions use a recognizable prefix and **include a stable hash of the absolute project root** so two projects with the same basename don't collide in the global tmux namespace.

- Agent sessions: `fmark-<basename>-<hash8>-ag-<participantId>`
- Terminal sessions: `fmark-<basename>-<hash8>-term-<index>`

`basename` is the project root's final path segment, lowercased + slugged (reusing `normalizeSlug` from `packages/kernel/src/sessions.ts`). `hash8` is the first 8 hex chars of `sha256(abs(projectRoot))`. Maximum session name length: 90 chars; participant ids are truncated to 32 chars if longer (regex already enforces ≤64; we cap at 32 for naming only).

On session creation, the Tmux Manager also stores two tmux user options for redundant reconcile verification:
- `@fmark-project` — absolute project root.
- `@fmark-participant` — the participant id (agent sessions only).

These are set via `tmux set-option -t <session> @fmark-project <path>` (session-scoped user options; no `-g` / `-w` / `-p` flag) and read on reconcile via `tmux show-options -t <session> -v @fmark-project`. They are immune to `cd` inside the pane.

**Minimum supported tmux version: 3.0.** Earlier versions lack reliable `display-message -p` format support for the user options we rely on. Probed at startup; surfaced via the env banner if missing.

## Presence States

Computed continuously in-memory. State machine:

| State | Definition | UI |
|---|---|---|
| `launching` | Spawn POST in flight; tmux session created but no hook ping yet. | Spinning indicator |
| `online` | Last hook ping ≤60s ago, OR (managed agent AND tmux pane alive AND last ping ≤120s ago). | Green dot |
| `stale` | Last hook ping 60s–10m ago. Managed agent with no ping for >120s but pane still alive falls here. | Amber dot |
| `offline` | No ping >10m and (unmanaged OR managed pane is dead). | Gray dot |
| `pane-dead` | Managed agent: tmux pane no longer exists (process exited). | Gray dot + "exited" badge + "Restart" action |
| `hook-not-installed` | Managed agent whose runtime had `hook-install-status: false` at spawn time (or at reconcile time). State is decided up-front from the install-status check, not by timing. Transitions to `online` immediately on first ping (proves the user pasted the snippet). | Gray dot + "Install hooks" affordance |

State transitions broadcast as WS messages: `{ type: "presence", participant_id, state, last_hook_at }`.

The TTL values are tuned for v0.4 acceptance:
- 60s online threshold: long enough for a hook fire on each Stop / PreToolUse / PostToolUse to keep `online` glued during a turn; short enough that a crashed agent fades quickly.
- 120s stretched threshold for managed-with-pane-alive: covers an agent thinking 90s without firing any hook.
- 10m offline threshold: matches typical idle-after-prompt time.

Future v0.5+ can tighten / loosen via runtime config; v0.4 ships with these constants.

## Data Model

### `.f-mark/runtimes.json` (new, per-project)

Written on `initProject()` with built-in defaults. Editable via Settings → Connected Agents → Manage Runtimes.

```json
{
  "version": "1.0",
  "runtimes": {
    "claude": {
      "displayName": "Claude Code",
      "executable": "claude",
      "args": [],
      "icon": "claude",
      "readyDelayMs": 2000
    },
    "codex": {
      "displayName": "Codex",
      "executable": "codex",
      "args": [],
      "icon": "codex",
      "readyDelayMs": 1500
    },
    "gemini": {
      "displayName": "Gemini",
      "executable": "gemini",
      "args": [],
      "icon": "gemini",
      "readyDelayMs": 1500
    }
  }
}
```

User additions: arbitrary `id`, `executable` (single PATH lookup name or absolute path, not a shell fragment), `args[]` (array of strings, never split), optional `env: Record<string, string>`, optional `icon` (built-in icon name or fallback to "bot"). No `command` field — that mistake from earlier drafts is closed.

Validation: `executable` must match `^[a-zA-Z0-9_./-]+$`; no spaces, no shell metacharacters. The renderer's "edit runtime" form keeps `executable` and `args[]` separate and only renders a shell-style display string for humans.

### `.f-mark/agents/<participant_id>/` (extends v0.3.0)

```
.f-mark/agents/ag-claude/
├── active-session         # v0.3.0 — unchanged
├── tmux-session           # NEW — F-Mark tmux session name (managed only)
├── runtime                # NEW — runtime_id (managed only)
└── log.jsonl              # NEW — per-agent lifecycle log (managed only)
```

`log.jsonl` records lifecycle events (spawn / kill / hook-detected / pane-died / send-keys / restart / state-change) as one JSON object per line. Bounded at 1MB with rotation to `log.jsonl.1` (single backup, not full multi-file rotation). Used by `GET /managed-agents/:id/logs` to fuel the chip's "show last failure" affordance.

### Participant model — unchanged

No schema additions to `config.json`. Managed-vs-unmanaged is purely a function of "does `.f-mark/agents/<id>/tmux-session` exist."

## Kernel HTTP Routes

All under standard `Bearer <token>` auth (existing `registerAuthHook`). Mutating routes (anything that spawns, kills, or sends keystrokes) additionally validate `Origin` / `Host` headers when the request authenticates via cookie (see §"Security").

### Managed Agents

- **`POST /managed-agents/spawn`** — body `{ runtime_id, session_id, name?, suggested_participant_id? }`.
  Creates participant (if `suggested_id` doesn't exist), writes `active-session` and `tmux-session` pointers, runs `tmux new-session -d -s <name> <executable> <args...>`, sets `@fmark-project` and `@fmark-participant` user options, appends to `log.jsonl`. **Does not** install hooks. **Does not** auto-`send-keys` a kickoff prompt unless `hook-install-status` reports the runtime's hooks already present — in that case it sends the rendered guide markdown (see §"Inbound Pane Input"). Otherwise leaves the pane at the runtime's startup screen and tells the UI to surface the manual hook-install instructions. Returns `{ participant_id, tmux_session, runtime_id, hooks_status }`.

- **`DELETE /managed-agents/:participant_id`** — the "say goodbye" action.
  Requires `confirm` query token (see §"Security"). Kills the tmux session (`tmux kill-session -t <name>`), removes `tmux-session` / `runtime` / `log.jsonl` files but **keeps `active-session`** so the participant can be relaunched later as an unmanaged agent.

- **`POST /managed-agents/terminal`** — body `{ name? }`.
  Creates `fmark-<basename>-<hash8>-term-<n>` tmux session running `$SHELL` in the project root. Returns `{ tmux_session, label }`.

- **`GET /managed-agents`** — returns `{ agents: [...], terminals: [...] }` computed live from `tmux ls -F` filtered by F-Mark prefix + `@fmark-project` verification, joined with `.f-mark/agents/*/` directory scan.

- **`GET /managed-agents/:participant_id/logs?since=<n>`** — returns the per-agent log (last `since` entries; default 50).

### Presence

- **`POST /agents/:participant_id/ping`** — body optional (empty `{}` accepted).
  Called by hooks alongside their existing event POSTs. Bumps the in-memory `lastHookAt`. Returns 204. **This is the only new endpoint v0.3.0 hooks need to start calling.** The auto-stream code already POSTs events; this is one more two-line call inserted ahead of those.

### Pane I/O

- **WebSocket `/ws/pane?session=<tmux_session>`** — subscribes to a tmux pane.
  Server messages:
  - `{ type: "pane.snapshot", data: <ansi-string> }` — initial render (capture-pane).
  - `{ type: "pane.data", data: <chunk> }` — incremental stream chunks.
  - `{ type: "pane.exit" }` — pane no longer exists.

  Client messages:
  - `{ type: "pane.input", data: <string> }` — literal text via `tmux send-keys -l -- <text>`.
  - `{ type: "pane.key", key: "Enter" | "C-c" | "C-d" | "Up" | ... }` — named key.
  - `{ type: "pane.resize", cols: <n>, rows: <n> }` — `tmux resize-window`.

  **One** `tmux pipe-pane` per pane in the kernel process; in-memory fan-out to all subscribers. Pipe starts when subscriber count goes from 0→1; stops when 1→0. When stopped, output produced while no subscribers are attached is **not buffered** by the kernel — the next subscriber re-snapshots via `capture-pane` and proceeds from there. Initial snapshot: `tmux capture-pane -t <session> -p -e -J -S -2000`. Tested with an injectable command runner.

- **`POST /managed-agents/:participant_id/command`** — body one of:
  - `{ type: "slash", command: "compact" | "clear" | "resume" | <free> }`
  - `{ type: "interrupt" }`
  - `{ type: "message", text: <string> }`

  Routes through the per-pane input queue (see §"Inbound Pane Input"). Returns `200` on enqueue, `409 { reason: "unmanaged_pane", offer: "open_overlay" }` for un-managed agents.

### Hook Install Status (read-only in v0.4)

- **`GET /managed-agents/hook-install-status?runtime_id=<id>&participant_id=<id>`** — returns `{ installed: bool, configPath: string, expectedEntries: HookEntry[], detectedEntries: HookEntry[] }`. The renderer uses this to show "✓ hooks detected" or to surface the manual install instructions with the appropriate `participant_id` baked in. Per-runtime adapters live in `packages/kernel/src/hooks-install/`:
  - `claude.ts` — parses `~/.claude/settings.json` and looks for `Stop` and `UserPromptSubmit` entries whose `command` contains `f-mark hook auto-stream <participant_id>`.
  - `codex.ts` — parses `~/.codex/config.toml` and `.codex/config.toml` (project-local) looking for `[[hooks.Stop]]` and `[[hooks.UserPromptSubmit]]` arrays referencing this participant_id.
  - `gemini.ts` — v0.4 reports `{installed: false, configPath: "", expectedEntries: []}` and the renderer shows: "Gemini CLI uses manual-stream mode in F-Mark v0.4; no hooks needed."

- **`POST /managed-agents/hook-install-instructions?runtime_id=<id>&participant_id=<id>&user_participant_id=<id>`** — *not* a write endpoint; returns `{ markdown: string, manualSteps: { configPath, snippet }[] }`. The renderer pastes the snippet into a modal with a copy button. No mutation of user config files in v0.4.

### Probe

- **`GET /env-probe`** — returns `{ tmux: bool, tmuxVersion: string | null, runtimes: Record<runtime_id, bool>, installer: string | null }`.
  `installer` is detected from PATH (apt/brew/dnf/yum/zypper/port/pacman) so the renderer can show the right install command. No `POST /env/install` route in v0.4 — the renderer just shows the command for the user to run themselves in a Terminal pane.

### Guide Endpoint Update

- **`GET /guide?agent_id=<id>&session_id=<id>&runtime_id=<id>`** (all optional).
  Backward compatibility: accepts the existing `sessionId` (camelCase) as an alias for `session_id`. Removes the "Hooks (NOT YET SHIPPED)" paragraph. With `agent_id` + `session_id`, the rendered markdown includes runtime-specific hook-install instructions naming the participant_id, the user participant id (queried from `GET /participants?kind=user`), and the session id. Used by:
  - The renderer's **Reconnect** modal (offline agent → click Reconnect → fetch with that agent_id → show copy-paste command).
  - The renderer's **Hook Install** modal when the spawn flow detected hooks were missing.
  - The kernel's internal "send kickoff to managed pane" path when hooks ARE detected — it renders the same markdown, strips it to just the user-facing kickoff text, and `send-keys` it via the input queue.

  Single source of truth across manual and managed paths.

## Inbound Pane Input

`tmux send-keys` is the only universal transport for kernel → pane delivery, but it's not a reliable RPC. Treat it accordingly.

**Per-pane input queue** (`packages/kernel/src/tmux/input-queue.ts`).
Serializes all keystrokes that touch a given pane — both kernel-injected (from `/command` or kickoff prompts) and overlay-typed (from WS clients). Strictly FIFO; one outstanding send-keys at a time. Prevents byte-level interleaving.

**Three command modes:**

1. **`interrupt`** — sends `C-c` immediately, bypasses idle gate. Always allowed.
2. **`slash`** — gated. The renderer checks `presence.state` first; if `online` with no in-flight tool (best-effort, derived from the last hook event being `Stop` / `UserPromptSubmit`), enqueue `/<command><Enter>`. Otherwise the renderer shows "Open terminal to send." Kernel-side it's just an enqueue; the gating is a UI policy.
3. **`message`** — free text. Always uses `tmux send-keys -t <s> -l -- <text>` (literal mode: keys are interpreted as raw characters, not tmux key names) followed by a separate `tmux send-keys -t <s> -- C-m` for Enter. Control characters in `text` (anything below 0x20 except `\t`) are rejected with 400.

For all three, the kernel appends a log entry (`log.jsonl`) recording the action.

**Cross-runtime reliability:** Claude Code, Codex, and Gemini CLI all run terminal-based TUIs that consume keystrokes. `interrupt` works universally. `slash` and `message` work *as if the user typed them* — meaning they're subject to whatever modal state the agent's TUI happens to be in. The honest framing in the UI: "Send /compact (best effort)" rather than implying reliability. If it doesn't take, the user can open the pane in the overlay and try directly.

## WebSocket Channels

The existing `ws/bus.ts` is a global broadcast. v0.4 keeps it for event-log notifications + new presence and managed-agent broadcasts. Adds a **separate** channel-based subsystem for pane streaming.

### Existing bus (`/ws`) — extended message types

- `{ type: "event_added", ... }` — unchanged.
- `{ type: "event_superseded", ... }` — unchanged.
- `{ type: "presence", participant_id, state, last_hook_at }` — new in v0.4.
- `{ type: "managed-agent.spawned", participant_id, tmux_session, runtime_id }`
- `{ type: "managed-agent.killed", participant_id }`
- `{ type: "managed-agent.terminal-spawned", tmux_session, label }`
- `{ type: "managed-agent.log", participant_id, entry }` — last-N log tail
- `{ type: "env-probe.updated", result }` — manual re-probe broadcast (no install route, but probes can be re-run on user-action)

### Pane channel (`/ws/pane?session=<id>`)

Separate endpoint, per-pane connections (one WS per pane the client wants to watch). Defined in §"Pane I/O" above. Multiple clients per pane share the single in-process pipe-pane stream.

## Reconcile on Startup

When the kernel starts:

1. Skip the entire feature if `tmux` is not on PATH; env-probe surfaces it; the `+` button is hidden.
2. `tmux ls -F '#{session_name} #{?#{==:#{session_attached},0},detached,attached}'`, filter by prefix `fmark-<basename>-<hash8>-`.
3. For each survivor: read user option `@fmark-project` via `tmux show-options -t <s> -w -v @fmark-project`; drop sessions whose value doesn't match the kernel's project root.
4. Cross-reference with `.f-mark/agents/*/`:
   - Agent dir + tmux session exists → managed agent, run `hook-install-status` for its runtime + participant_id. If hooks present → state = `stale` (next ping flips to `online`). If hooks absent → state = `hook-not-installed`.
   - Agent dir + tmux session gone → managed agent died during kernel downtime. Clear `tmux-session` + `runtime` files (keep `active-session` + `log.jsonl`). Append a `pane-died` log entry. State = `pane-dead`.
   - Tmux session + no agent dir → either a terminal session or an orphan. Terminals: keep as terminal; orphan agent sessions get killed (we wrote `@fmark-participant` but no agent dir means inconsistent state).
5. Non-blocking; reconcile completes under 200ms for reasonable session counts.

## Renderer UI

### Top Bar — Agent + Terminal Chips

Horizontally-scrolling row of chips. Each chip:

- **Agent chip:** runtime icon + participant name + state dot (green/amber/gray, per §"Presence States"). For `pane-dead`, an additional "exited" pill. For `hook-not-installed`, a small wrench icon.
  Click opens the action menu.
- **Terminal chip:** terminal icon + `terminal <n>` label. Click opens the terminal action menu.
- **`+` button:** trailing chip. Click opens dropdown with: Claude, Codex, Gemini (icons from registry, disabled with tooltip if env-probe says missing), separator, Terminal, separator, "Manage runtimes…".

**No telemetry ring in v0.4.** Just the state dot.

### Agent Action Menu

- **Rename** — inline edit of `participant.name`.
- **Send `/compact` (best effort)** — `POST /managed-agents/:id/command { type: "slash", command: "compact" }`. Disabled when state is not `online` (tooltip explains why) and when the agent is unmanaged.
- **Send `/clear` (best effort)** / **Send `/resume` (best effort)** — sub-items under "Slash commands…".
- **Interrupt (Ctrl-C)** — `{ type: "interrupt" }`. Disabled if state is `offline` or `pane-dead`.
- **Send a message…** — opens an inline text input below the menu. Submit posts `{ type: "message", text }`.
- **Open terminal** — opens the Terminal Overlay focused on this agent's pane.
- **Reconnect** — only when offline or `pane-dead`. Opens Reconnect Modal (rendered `/guide` markdown with copy button).
- **Show last failure** — when `log.jsonl` has a recent failure event; opens a small overlay rendering the last 20 log entries.
- **Say goodbye** — kills the tmux session. Confirmation flow gated by a one-time token (§"Security").

### Terminal Action Menu

- Rename, kill, open in overlay.

### Terminal Overlay (xterm.js)

Full-screen-ish modal hosting an xterm.js terminal connected to the pane WS channel:

- Initial `pane.snapshot` populates scrollback.
- Streaming `pane.data` writes ANSI passthrough.
- Input box → WS `pane.input` (text) and `pane.key` (named keys).
- Resize: `pane.resize` on viewport change.
- Tab strip: switch between open agent/terminal panes without closing.
- "Detach" closes the modal but leaves tmux session alive. "Say goodbye" / "Kill terminal" sends the destroy action.

### Hook Install Modal

Shown when:
- A spawn completes and `hook-install-status` reports hooks missing, OR
- The user clicks "Install hooks" on a chip whose state is `hook-not-installed`.

Modal renders the response of `POST /managed-agents/hook-install-instructions?...` — runtime-specific manual snippet with **Copy** button. Below it: "After you save the file, your agent should appear as online on the next event."

No automated write. The user pastes the snippet themselves. The next hook fire from that agent triggers `/agents/:id/ping` and the chip flips to online — proof the install worked.

### Reconnect Modal

Shown for offline / pane-dead agent chips. Renders `/guide?agent_id=...&session_id=...&runtime_id=...` with a prominent **Copy launch command** button.

### Settings → Connected Agents

Existing modal section extended:
- The existing "Invite new agent" affordance stays — that path remains for un-managed agents.
- New section: **Manage Runtimes**. Table of registered runtimes (icon, displayName, executable, args, type=builtin/custom). Edit + remove for custom; executable + args editable for builtins (so `claude` can become `claude --model haiku`). Add button → form with separate fields for executable, args, env, icon picker. No `command` blob field.
- New section: **Hook Status**. Per-runtime row showing detected status; "Show install instructions" button for runtimes whose hooks are missing.
- New section: **Environment Probe**. Last probe result + Re-probe button.

### Env Probe Banner

Below the top bar. Shown when env-probe reports:
- `tmux: false` → "Tmux not installed — managed agents disabled. Install command: `<package-manager install tmux>`" with a Copy button.
- `tmux: true, tmuxVersion < 3.0` → "Tmux too old (need 3.0+). Update with: `<command>`".
- Specific runtime missing → "X not on PATH — its `+` option is disabled. Install at: `<docs URL>`".

Banner does not directly install anything in v0.4.

## Security

The threat model expands meaningfully: v0.4 introduces routes that spawn processes (`POST /managed-agents/spawn`, `POST /managed-agents/terminal`) and inject keystrokes into running TUIs (`POST /managed-agents/:id/command`, `/ws/pane` input). Mitigations:

1. **Bearer-token gate.** All new routes go through the existing `registerAuthHook`. Same as today.

2. **Origin/Host validation for mutating routes when auth came via cookie.** The shipped `auth.ts` accepts the bearer token either as `Authorization` header, query param (which then sets an HttpOnly + SameSite=Strict cookie), or the cookie itself. SameSite=Strict gives strong CSRF protection in modern browsers, but for defense in depth, all new POST/DELETE routes that authenticate via cookie also validate `Origin` (must be a `localhost` / `127.0.0.1` / configured-host scheme) and `Host` headers. Mismatch → 403. Cookie-authenticated requests without an `Origin` header are also rejected (browsers always send it; absence indicates a non-browser caller that should have used the bearer header).

3. **`--no-auth` disables process-spawning routes by default.** Today `--no-auth` disables the bearer gate entirely. In v0.4, the spawn / kill / command / pane-input routes refuse to register if `--no-auth` is set, **unless** the user also passes a new flag `--allow-process-api-no-auth`. The startup banner shows a loud warning when both are set. (We keep `--no-auth` working for read-only API exploration; it just doesn't let an unauthenticated peer execute commands.)

4. **One-time confirm token for `DELETE /managed-agents/:id`.** Renderer calls `GET /managed-agents/:id/confirm-token` (returns a single-use token with 10s TTL); the actual DELETE requires `?confirm=<token>`. Prevents accidental kills from misfired requests.

5. **No shell injection surface.**
   - `executable` and `args[]` are passed as separate argv to `tmux new-session`, never through a shell.
   - `executable` is validated against `^[a-zA-Z0-9_./-]+$`.
   - `message` text rejects control characters (other than `\t`); uses `send-keys -l --` so the bytes are literal, not interpreted as tmux key names. The `--` separator prevents argument injection into tmux.
   - `slash` command names also validated: `^[a-zA-Z][a-zA-Z0-9_-]{0,32}$`. No spaces — slash command args aren't supported in v0.4 (defer until anyone asks).

6. **Audit log.** Every spawn, kill, send-keys (kernel-side), terminal-spawn, hook-install-status read, and pane WS subscribe is appended to `<agent>/log.jsonl` (per-agent) or `<kernel>/audit.jsonl` (per-kernel for cross-agent actions). Visible via `GET /managed-agents/:id/logs` and (separately) via a future kernel-wide audit view.

7. **Hook install instructions, not writes.** v0.4 never writes to user config files. The Hook Install modal renders text the user copies. (Defers to v0.5+ once the consent-flow + adapter ergonomics are designed.)

## Testing Strategy

### Unit tests (Vitest, no real tmux required)

- Pure functions: tmux session naming/parsing (incl. path-hash), ownership verification helpers, runtime config parsing + validation, hook-install-status parsing for Claude settings.json + Codex config.toml, presence state machine transitions.
- CLI subcommands existing in v0.3.0: unchanged tests in `packages/kernel/tests/hooks/`.
- Routes via Fastify-inject (`packages/kernel/tests/routes/`): spawn, kill, terminal-spawn, list-managed, ping, command (all three types incl. control-char rejection), confirm-token, hook-install-status, env-probe.
- Pane WS subsystem: simulated subscribe → snapshot → data → input with injectable command runner; asserts single pipe-pane invocation regardless of subscriber count.
- Renderer (RTL): chip states, action menus (disabled-state tooltips), `+` dropdown, terminal overlay (xterm.js mocked), Hook Install Modal, Reconnect Modal, Env Probe Banner.
- Reconcile on startup: integration test with fixture tmux output covering the three cases.

### Optional tmux smoke (`packages/kernel/tests/smoke/tmux.smoke.test.ts`)

Runs **only when `tmux` is on PATH and at least 3.0**. Skipped otherwise (via `it.runIf(haveTmux)`). The smoke:

1. Creates a real tmux session in a temp dir.
2. Sends literal text via `send-keys -l --`.
3. Captures pane output and asserts it contains the text.
4. Attaches one pipe via `tmux pipe-pane`; verifies the FIFO receives the same data.
5. Attaches a second simulated subscriber; verifies in-memory fan-out (the test framework subscribes to the kernel's already-running pipe, not a new one).
6. Kills the session and verifies cleanup.

Kept conditional in CI so non-tmux dev machines stay green; runs in release CI / pre-release scripts where tmux is guaranteed.

### Manual smoke checklist per release

Per-runtime checks (the user runs these on a real machine):

- **Claude Code:** `+` → Claude. Pane spawns. Hook Install modal appears. User pastes snippet into `~/.claude/settings.json`. Chip flips online on next hook fire. Try `/compact` from menu. Try `interrupt`. Try `message`. Verify terminal overlay shows live output.
- **Codex:** same flow, with `.codex/config.toml`.
- **Gemini:** `+` → Gemini. Pane spawns. Hook Install modal shows "Gemini uses manual-stream — no hooks needed." Chip starts in `stale`, flips to `online` after the model registers + streams its first prose event.
- **Terminal:** `+` → Terminal. Pane spawns with shell. User can manually run any of the three CLIs; presence appears via existing v0.3.0 flow.

Checklist lives in `docs/superpowers/plans/<plan-id>/manual-smoke.md` created by writing-plans.

### Regression coverage for v0.3.0

Critical: v0.3.0 auto-stream tests must continue to pass unchanged. The Phase 1 task of implementation runs the existing kernel test suite as a tripwire — any regression there blocks further work.

## Phased Implementation Outline (v0.4)

Detailed step-by-step lives in the implementation plan (created via `writing-plans` after this spec is approved). Phasing:

1. **Phase 1 — Regression tripwire.** Run existing `pnpm -r test` and capture green baseline. No code changes.
2. **Phase 2 — Tmux Manager (no UI).** Injectable command runner; session naming with path hash; user-option set/get; spawn/list/kill/capture-pane/send-keys-literal/pipe-pane helpers. Vitest unit coverage.
3. **Phase 3 — Runtime Registry.** `.f-mark/runtimes.json` loader, defaults writer in `initProject`, CRUD operations, validation. Tests for parsing, defaults, validation rejection cases.
4. **Phase 4 — Presence Tracker + `POST /agents/:id/ping`.** In-memory state map; state machine implementation; WS broadcast. Tests for transitions.
5. **Phase 5 — Hook install for v0.3.0 to call `ping`.** Update the shipped `runAutoStream` to POST a ping at the start of every fire. Verify v0.3.0 smoke still passes. Update the skill bundles' hook snippets to reference the same command (no change — the snippet shape stays; only the kernel side starts pinging).
6. **Phase 6 — Managed-agent routes (spawn/kill/list/terminal/logs/confirm-token).** Fastify-inject tests.
7. **Phase 7 — Pane WS subsystem.** New endpoint `/ws/pane`; channel routing; pipe-pane fan-out; input queue. Tests with injected command runner.
8. **Phase 8 — `/command` routes + per-pane input queue + control-char validation.**
9. **Phase 9 — Reconcile on startup.**
10. **Phase 10 — Env probe + Guide endpoint update.** Updated `/guide` with runtime-aware substitution + alias for `sessionId`.
11. **Phase 11 — Hook Install Status (read-only) + instruction renderer.**
12. **Phase 12 — Renderer UI: top-bar chips, action menu, + button, terminal overlay (xterm.js), Hook Install Modal, Reconnect Modal, Env Probe Banner.**
13. **Phase 13 — Settings → Manage Runtimes + Hook Status + Re-probe.**
14. **Phase 14 — Optional tmux smoke test.** Conditional on PATH.
15. **Phase 15 — Docs + skill bundle updates** (mention managed spawn, terminal overlay, reconnect).
16. **Phase 16 — Manual smoke pass per runtime.** Verify all three runtimes work end-to-end on a real machine; capture findings in `manual-smoke.md`.

Each phase ends with a `/buddy` verification pass that confirms tests are not just claimed-green but actually run + the assertions actually fired.

## Future Work

### v0.5 — Hook Installer (write side) + Presence Refinement

- Per-runtime config-file write adapters for Claude (`settings.json` JSON merge), Codex (`config.toml` with comment preservation via a TOML library that supports round-tripping), Gemini (`settings.json`, once we have a Gemini-flavored transcript parser justifying hooks at all). Backup-before-write to `<configPath>.fmark-backup-<ts>`. Stable F-Mark-owned hook IDs for matching during uninstall.
- Codex structured hook events (PreToolUse / PostToolUse / PermissionRequest) consumed directly without transcript parsing, lifting Codex out of "preview" mode.
- Presence refinements: per-runtime TTL constants, "awaiting approval" detection from Notification / PermissionRequest hooks, configurable thresholds.
- Audit-log viewer in the UI.

### v0.6 — Telemetry + Context Accounting

- Per-runtime transcript-format parsers with real fixture files captured from live sessions. Live in `packages/kernel/src/transcript-parsers/{claude,codex,gemini}/`.
- `context_pct` + `tokens_used` derivation. Context window caps **live in runtime config only**, never hardcoded. Unknown model → omit `context_pct` and show "unknown context window."
- `last_tool` indicator on agent chip.
- Optional supervisor daemon, justified by a specific concrete user-visible bug (e.g., "manual agent shows offline during a 45-minute silent planning turn"). If/when implemented:
  - Portable lockfile protocol (`open(path, "wx")` with PID + started_at + last_heartbeat).
  - Exponential backoff for kernel-down windows.
  - Durable event queue with atomic writes + idempotency tokens.
  - Stale-lock recovery + crash recovery tests.

### Beyond v0.6

- Multi-machine spawn targets (`host: "user@machine"` runtime field).
- Per-pane recording / replay (pipe-pane output archive to disk).
- Auto-restart-on-crash policies (`restartPolicy: "on-failure"`).
- Permission-scoped tokens for shared-team kernels.

---

## Decision Summary

| Decision | Chosen | Rationale |
|---|---|---|
| Runtime model | Data-driven adapter (`.f-mark/runtimes.json`) with `{ executable, args[], env? }` | Adding a runtime should never be a code change; argv form is the only safe representation. |
| Lifecycle on kernel exit | Detach (tmux sessions survive) | Agent context survives kernel restarts and updates. |
| Presence detection (v0.4) | TTL + tmux liveness, no daemon | Daemon adds complexity for a problem v0.4 doesn't have. Defer to v0.6 behind a concrete bug. |
| Browser terminal transport | Single `tmux pipe-pane` per pane + in-memory WS fan-out | tmux only supports one active pipe per pane; per-subscriber fifos would break each other. |
| Inbound control transport | `tmux send-keys` framed as best-effort | Universal; reliable for `interrupt`, idle-gated for `slash`/`message`; honestly labeled in UI. |
| Hook installation | Read-only detection + manual-paste instructions (v0.4) | Editing user config is a trust cliff; defer write side to v0.5 after consent flow is designed. |
| Telemetry | Deferred to v0.6 behind real fixtures | Runtime transcripts are not all Claude-shaped; over-promising creates trust debt. |
| Env install | Probe + copyable command (v0.4) | Installing package managers from F-Mark is unrelated risk; users can copy and run. |
| Tmux session naming | `fmark-<basename>-<hash8>-{ag,term}-<id>` + `@fmark-project` user option | Avoids global tmux namespace collisions across F-Mark projects sharing a basename. |
| Minimum tmux version | 3.0 | Reliable user-option support; surfaced via env-probe. |
| Spawn under `--no-auth` | Disabled unless `--allow-process-api-no-auth` | Unauthenticated process spawning over a network port is RCE. |
| Migration from v0.3.0 | Strictly additive — `auto-stream` unchanged; new `ping` route added | No regression risk for shipped users. |
| Per-runtime parity | Feed parity, not mechanism parity | Claude = auto-stream transcript; Codex = preview + hook events; Gemini = manual-stream. Honest. |
| Scope | v0.4 = managed tmux + terminal overlay + reconcile + guide update. v0.5/v0.6 deferred. | Single-cycle scope; risk profile per release stays tight. |

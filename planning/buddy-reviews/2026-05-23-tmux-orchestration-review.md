# Review: tmux agent orchestration design

## Executive summary

- Bottom line: ready-with-revisions only if the supervisor/telemetry parts are rewritten before implementation; as written, this is not ready to execute.
- The tmux-managed session idea is viable, but the spec mixes a solid v0.4 feature with speculative presence, telemetry, installer, and control-plane claims.
- The spec is stale against v0.3.0: auto-stream shipped, the current hook path works, and replacing it wholesale would risk a regression.
- The biggest technical lie is runtime parity: Claude, Codex, and Gemini do not currently have the same transcript contract, and the shipped code is Claude-shaped.
- Ship managed tmux sessions first, preserve the existing auto-stream path, and defer transcript-derived telemetry until each runtime has real fixtures and smoke coverage.

## Findings

### 1. [Blocker] The spec is stale about v0.3.0 and would regress a shipped path

Evidence:
- Spec says it "absorbs and supersedes the in-flight" plan and collapses per-Stop parsing into the daemon: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:11-12`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:456-472`.
- The repo is already at `0.3.0`: `package.json:1-3`, `packages/kernel/package.json:1-3`.
- The shipped CLI has `f-mark hook auto-stream <participant_id>` wired today: `packages/kernel/src/cli.ts:80-125`.
- The shipped hook posts user prompts and assistant turns now: `packages/kernel/src/hooks/autoStream.ts:25-92`.
- The smoke doc says the hook-to-kernel contract is under CI and describes what is covered: `docs/superpowers/plans/2026-05-23-auto-stream-hook-smoke.md:13-19`, `docs/superpowers/plans/2026-05-23-auto-stream-hook-smoke.md:23-82`.

Problem:
The design reads like a refactor of unstarted work, but the actual starting point is shipped, tested behavior. A plan that "replaces" the hook without an explicit compatibility path is dangerous.

Do this:
- Rewrite the "Auto-Stream-Hook Plan Refactor" section as a migration plan from v0.3.0.
- Keep `f-mark hook auto-stream` as a supported compatibility command until the supervisor path has equal or better coverage.
- Add a compatibility shim only after the new flow is proven: `auto-stream` can enqueue to the supervisor, but it must still be able to post directly if the supervisor is disabled or broken.
- Update the spec to say "evolve shipped v0.3.0 code" instead of "in-flight/unstarted plan."

### 2. [Blocker] The supervisor daemon does not justify its complexity

Evidence:
- Spec assigns heartbeat, transcript streaming, telemetry, and death detection to one daemon: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:37-44`.
- Presence flow depends on the first hook spawning that daemon: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:57-80`.
- Outbound events are funneled through queue files consumed by the daemon: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:101-105`.
- Current shipped hook already reads the active-session pointer and posts the projected events synchronously: `packages/kernel/src/hooks/autoStream.ts:47-70`, `packages/kernel/src/hooks/post.ts:18-52`.

Problem:
The daemon fixes a narrow problem - presence while the agent is quiet - by adding a long-lived process, locking, event queues, transcript tailing, heartbeat retries, crash recovery, PID tracking, and cleanup. The spec never names the user-visible bug this fixes strongly enough to justify that blast radius.

Do this:
- Do not make the supervisor daemon part of v0.4.
- For v0.4, derive presence from existing hook fires plus a generous TTL, for example 2 minutes after `UserPromptSubmit`, `Stop`, `PreToolUse`, or `PostToolUse`.
- For managed tmux panes, derive a second presence signal from tmux session/process liveness. That covers F-Mark-spawned agents without touching manual agents.
- Show "stale" rather than "offline" when the only signal is old hook activity and no managed pane exists.
- Revisit a daemon only after there is a concrete requirement like "manual agent must show online during a 45-minute silent planning turn."

### 3. [Blocker] The daemon cannot reliably know the agent PID as specified

Evidence:
- Spec says death detection is `kill -0 <agent_pid>`: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:41-42`.
- Spec says hooks run `f-mark hook ensure-supervisor <agent_id>` with only the agent id: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:55-56`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:462-464`.
- Codex hook stdin has `session_id`, `transcript_path`, `cwd`, model fields, etc., but not a runtime PID: `docs/superpowers/plans/2026-05-23-codex-hooks-research.md:91-123`.
- Gemini hook stdin likewise has no process PID: `docs/superpowers/plans/2026-05-23-gemini-hooks-research.md:110-168`.

Problem:
`agent_pid` appears from nowhere. Guessing from `process.ppid` inside an `npx`-spawned hook is not robust: the parent may be a shell, npm, node, or a hook runner wrapper rather than the long-lived TUI. On managed panes the better PID source is tmux. On unmanaged terminals there may be no reliable PID source.

Do this:
- Remove PID-based death detection from the generic hook supervisor design.
- For managed agents, store `tmux_session` and use tmux liveness as the authoritative process/pane signal.
- For unmanaged agents, use TTL-based hook presence only.
- If a future daemon remains, make `agent_pid` optional and source-specific; never make `kill -0` the universal presence contract.

### 3a. [Major] If the daemon comes back later, locking and retry semantics must be specified

Evidence:
- Spec says the supervisor is "flock'd" at `.f-mark/agents/<id>/.supervisor.lock`: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:37-39`.
- Spec says the daemon heartbeats every 15 seconds: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:68-72`.
- Spec relies on surviving supervisors heartbeating after kernel restart: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:474-486`.

Problem:
Node has no built-in portable `flock`, macOS/Linux lock behavior differs by primitive, and the spec does not define stale-lock cleanup. It also does not say what happens while the kernel is down for 30 seconds during restart. A daemon that exits on fetch failure would lose the one benefit it supposedly brings.

Do this:
- Use a portable JS lockfile protocol: `open(path, "wx")`, write `{ pid, started_at, last_heartbeat }`, and treat stale locks as recoverable after a timeout.
- Do not depend on fcntl/lockf/flock unless the exact npm package or Node implementation is named and tested on macOS and Linux.
- Heartbeat and telemetry POSTs must use exponential backoff with jitter and must not exit while the kernel is temporarily unavailable.
- Queue events durably while offline, then flush when `/health` recovers.
- Add tests for stale lock, daemon crash, kernel restart, and duplicate hook fires.

### 4. [Blocker] Runtime parity is asserted where the shipped code and research say it is false

Evidence:
- Spec claims `context_pct` works by summing token counts because "each runtime exposes these in transcript entries": `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:107-113`.
- Spec's capability matrix says token-derived `context_pct` is supported for all three runtimes: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:141-147`.
- Shipped transcript parser expects Claude-shaped `{ role, content: [...] }` entries: `packages/kernel/src/hooks/transcript.ts:12-27`, `packages/kernel/src/hooks/transcript.ts:37-110`.
- Codex skill explicitly marks auto-stream transcript parsing as preview because Codex transcript schema differs: `packages/kernel/assets/codex-skill/f-mark/SKILL.md:6-7`.
- Gemini skill explicitly says F-Mark cannot parse Gemini transcript JSONL today: `packages/kernel/assets/gemini-skill/f-mark/SKILL.md:22-24`, `packages/kernel/assets/gemini-skill/f-mark/SKILL.md:91-93`.
- Codex research says the rollout JSONL is unstable and not Claude-shaped: `docs/superpowers/plans/2026-05-23-codex-hooks-research.md:212-236`.
- Gemini research says the transcript format is incompatible and `prompt_response` is insufficient for tool structure: `docs/superpowers/plans/2026-05-23-gemini-hooks-research.md:211-281`.

Problem:
The spec treats transcript parsing as the common substrate. It is not. That makes `context_pct`, `last_tool`, and full lifecycle telemetry over-promised for Codex and Gemini.

Do this:
- Remove all-runtime `context_pct` from the initial implementation.
- Keep Claude transcript projection as the only shipped transcript parser until Codex and Gemini have real fixture files from live sessions.
- For Codex, prefer structured hook stdin from `PreToolUse`/`PostToolUse` and `last_assistant_message` rather than parsing rollout JSONL.
- For Gemini, keep manual-stream mode as the primary integration until a dedicated Gemini transcript parser exists.
- Change the capability matrix to "feed parity, not mechanism parity": Claude = auto-stream transcript, Codex = hook-event stream with transcript best-effort, Gemini = manual stream today.

### 5. [Major] The spec would lose the user-prompt identity that v0.3.0 just fixed

Evidence:
- Spec says every hook entry is bound to one command: `npx f-mark hook ensure-supervisor <agent_id>`: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:54-55`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:462-464`.
- Current Claude skill installs two hooks: Stop posts as the agent id, UserPromptSubmit posts as the user id: `packages/kernel/assets/claude-skill/f-mark/SKILL.md:24-45`.
- Current `runAutoStream` accepts `--kind user` and posts user prompts as non-arbitrary prose without a turn-end: `packages/kernel/src/hooks/autoStream.ts:74-91`.

Problem:
Collapsing all hook fires under `<agent_id>` risks logging user prompts as the agent, or dropping them entirely. The current design explicitly repaired the user participant link; do not erase it.

Do this:
- Keep separate subject identities in hook config: one participant id for assistant output, one for user prompts.
- If a supervisor consumes both event types, queue files must include `subject_participant_id` and `logical_event`.
- For managed spawns, pre-wire both the agent pointer and the active user pointer before sending the onboarding prompt.
- Add tests proving UserPromptSubmit still posts as `us-*`, not `ag-*`.

### 6. [Major] `tmux send-keys` is acceptable as a convenience, not a reliable control plane

Evidence:
- Spec makes `tmux send-keys` the universal inbound transport: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:127-135`.
- Command route sends slash commands and arbitrary messages into the pane: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:307-314`.
- Pane input also uses `tmux send-keys`: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:350-354`.
- UI proposes "Send /compact", interrupt, and free-text messages from the chip menu: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:389-400`.

Problem:
This is byte injection into a live TUI. It can interleave with user typing, land during a redraw/modal/approval prompt, or be interpreted as key names unless literal mode is used. It also has different behavior across Claude, Codex, and Gemini TUIs.

Do this:
- Reframe inbound actions as "best-effort pane input", not a reliable control API.
- Implement `interrupt` first; it is the least ambiguous.
- For slash commands and free text, require the pane to be idle according to the best available runtime signal; otherwise show "open terminal to send."
- Serialize all F-Mark-originated input through a per-pane input queue.
- Use `tmux send-keys -l -- <text>` for literal text, then a separate `C-m` for Enter. Use named keys only for control keys.
- Reject or escape control characters in free-text messages, except the explicit controls F-Mark owns.

### 7. [Major] `pane.<id>` WebSocket fan-out is wrong for tmux pipe-pane

Evidence:
- Spec claims each subscriber gets its own `pipe-pane` and other subscribers are unaffected when one disconnects: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:347-354`.
- Existing WS bus has no channel subscription model; it broadcasts every message to every connected client: `packages/kernel/src/ws/bus.ts:20-44`.

Problem:
tmux supports one active `pipe-pane` command per pane. Starting another pipe for another subscriber replaces the previous pipe. The spec's per-subscriber FIFO model will disconnect or starve existing subscribers.

Do this:
- Implement one pipe per pane per kernel process.
- Fan out that one pipe stream to all subscribed WebSocket clients in memory.
- Start the pipe when the first subscriber arrives; stop it only after the last subscriber leaves.
- Add a channel subscription protocol to `ws/bus.ts` instead of extending the current global broadcast type.
- Use streaming UTF-8 decoding, preserve ANSI escape boundaries, and define backpressure/drop behavior for slow clients.

### 8. [Major] Hook installation is too invasive and underspecified

Evidence:
- Spec proposes editing `~/.claude/settings.json`, `~/.codex/config.toml`, and `~/.gemini/settings.json`: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:54-55`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:337-341`.
- UI prompt is a backup-based reassurance: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:416-425`.
- Codex supports project config, `hooks.json`, plugin-bundled hooks, and trust gating: `docs/superpowers/plans/2026-05-23-codex-hooks-research.md:17-23`, `docs/superpowers/plans/2026-05-23-codex-hooks-research.md:178-180`.
- Codex skill currently prefers project-level config and warns about hook trust: `packages/kernel/assets/codex-skill/f-mark/SKILL.md:28-48`.
- Gemini skill currently uses manual mode and does not need hook installation: `packages/kernel/assets/gemini-skill/f-mark/SKILL.md:22-24`.

Problem:
Global config rewriting is a trust cliff and a maintenance trap. TOML comment preservation is hard, config syncers can fight the edits, schema drift breaks idempotency, and Gemini should not get an auto-stream hook until F-Mark can parse its transcript.

Do this:
- Do not edit global runtime configs by default.
- Prefer project-local hook config or bundled runtime skill/plugin hooks where the runtime supports it.
- For Codex, prefer `hooks.json` or a plugin-bundled hook over rewriting `config.toml`.
- For Gemini, do not install an auto-stream hook in this feature. Keep manual-stream parity.
- Make the installer a dry-run diff plus copyable manual instructions first; add write support per runtime only after adapter tests use realistic fixtures.
- Track installed hooks with stable F-Mark-owned identifiers, not substring matching on `command`.

### 9. [Major] Session naming collision is not harmless

Evidence:
- Spec names sessions `fmark-<projectSlug>-ag-<participantId>` and says collisions across projects are harmless because CWD verification filters them: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:253-263`.
- Existing session slug normalizer only normalizes user-visible session slugs and has no exported path-hash helper: `packages/kernel/src/sessions.ts:25-38`.

Problem:
tmux session names are globally unique within the user's tmux server. Two projects with the same basename and participant id cannot both create the same session name. CWD verification helps during reconcile, but it does not solve spawn-time collisions.

Do this:
- Include a stable hash of the absolute project root in every F-Mark tmux session name, for example `fmark-<basename>-<hash8>-ag-<participantId>`.
- Store the project root and F-Mark project id in tmux user options or environment on session creation, then verify both that marker and `pane_current_path` during reconcile.
- Define a maximum session-name length and truncation rule.
- Define the minimum supported tmux version.

### 10. [Major] The guide endpoint shape in the spec does not match the shipped route

Evidence:
- Spec wants `GET /guide?agent_id=<id>&session_id=<id>` with runtime-aware substitution: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:49-52`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:327-330`.
- Shipped route accepts only camelCase `sessionId`: `packages/kernel/src/routes/guide.ts:6-18`, `packages/kernel/src/routes/guide.ts:53-67`.
- Shipped guide still says hooks are not implemented: `packages/kernel/src/routes/guide.ts:42-43`.
- Shipped guide hardcodes Claude skill install paths: `packages/kernel/src/routes/guide.ts:33-40`.

Problem:
Managed spawn depends on the guide endpoint, but the route is stale and runtime-specific in the wrong direction. If implemented as specified, the kernel will call query params the route does not understand.

Do this:
- Update `/guide` before managed spawn work starts.
- Support `agent_id` and `session_id` exactly as the spec says; keep `sessionId` as a backward-compatible alias.
- Remove the "hooks not shipped" text.
- Render runtime-specific skill/install instructions for Claude, Codex, and Gemini.

### 11. [Major] Security model misses current cookie auth and new process-spawn risk

Evidence:
- Spec says all new routes use bearer-token auth: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:268-270`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:488-493`.
- Current auth accepts query token and then sets an HttpOnly cookie: `packages/kernel/src/auth.ts:63-70`, `packages/kernel/src/auth.ts:114-125`.
- Current auth accepts that cookie on later requests: `packages/kernel/src/auth.ts:125-130`.
- Process-spawning APIs include spawn, command injection into panes, hook installation, and env install: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:274-323`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:337-341`.

Problem:
The security surface changes from "write event files" to "spawn processes, install hooks, send keystrokes, run package managers." Cookie auth means CSRF is not purely theoretical, even with SameSite=Strict. The spec also treats `--no-auth` as a warning problem, but in this feature it becomes remote command execution on whoever can reach the port.

Do this:
- Add Origin/Host validation for all mutating routes when cookie auth is used.
- Require an explicit CSRF token or double-submit header for process-spawning and config-writing routes.
- Keep bearer header auth for hook calls, but do not rely on cookies for `/managed-agents/*`, `/env/install`, or pane input.
- Disable process-spawning routes by default under `--no-auth` unless the user passes a second explicit flag like `--allow-process-api-no-auth`.
- Log every spawn, send-keys, hook-install, env-install, and kill action to a user-visible audit log.

### 12. [Major] The "no shell injection" claim is both too weak and too restrictive

Evidence:
- Spec says runtime `command` is split on whitespace and passed as argv: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:492`.
- Runtime model also lets users set `command` and `args`: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:163-233`.
- UI explicitly says built-in commands can become strings like `claude --model haiku`: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:428-433`.

Problem:
Whitespace splitting breaks quoted arguments and still leaves ambiguous behavior. A user-supplied command string is not a safe or faithful representation of argv.

Do this:
- Store runtime launch as `{ executable: string, args: string[], env?: Record<string,string> }`.
- Render a shell-like display string only for humans.
- Validate `executable` is a single path or PATH lookup name, not a shell fragment.
- For custom runtimes, provide separate UI fields for executable and args.
- Keep env install as a separate privileged path with explicit shell use and stronger confirmation.

### 13. [Major] Event queue and transcript watching need real durability semantics

Evidence:
- Spec writes hook event drops to `.f-mark/agents/<id>/.events/<ts>.json`: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:101-105`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:235-248`.
- Spec uses `fs.watch` on JSONL transcripts: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:39-41`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:101-105`.
- Current hook avoids this by reading the transcript on Stop and posting directly: `packages/kernel/src/hooks/autoStream.ts:55-70`.

Problem:
Moving to queue files and live file watching creates new failure modes: partial writes, duplicate processing, missed `fs.watch` events, transcript rotation/truncation, invalid partial JSONL, and disk leaks. The spec has no cleanup or idempotency design.

Do this:
- If a queue is kept, write events as `<name>.tmp` then atomic rename to `<name>.json`.
- Include event ids and processed markers so the supervisor can retry safely without duplicate posts.
- Delete or archive processed queue files with a TTL and max-directory-size cap.
- Use `chokidar` plus periodic polling fallback, since it is already a kernel dependency.
- Persist transcript offsets by transcript path and handle truncation by resetting safely.

### 14. [Major] Scope is too large for one implementation cycle

Evidence:
- Spec has 12 phases spanning tmux, registry, daemon, routes, WS terminal, hook installer, renderer, reconcile, guide, env installer, settings, docs: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:495-510`.
- It explicitly adds an installer flow with OS/package-manager heuristics: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:316-325`, `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:446-455`.

Problem:
This is not one feature. It is at least three risk profiles bundled together: process lifecycle, terminal transport, and runtime telemetry/config mutation. Implementing it as one push will hide regressions and make runtime parity worse, not better.

Do this:
- v0.4: managed tmux sessions, terminal overlay, list/kill/reconcile, guide update, current auto-stream preserved. No telemetry ring. No hook installer. No context_pct.
- v0.5: per-runtime hook installer/status, presence TTL, Codex structured hook events, safer command actions. Gemini remains manual-stream.
- v0.6: telemetry and context accounting, but only after real transcript fixtures and runtime-specific parser tests exist.
- Cut env package installation from this feature entirely. Probe is useful; installing package managers from F-Mark is not needed for tmux orchestration.

### 15. [Major] Testing strategy is underpowered for a tmux feature

Evidence:
- Spec explicitly says no real tmux E2E in CI: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:512-522`.
- Current smoke doc already flags gaps around real runtime hook wiring and browser rendering: `docs/superpowers/plans/2026-05-23-auto-stream-hook-smoke.md:84-110`.

Problem:
Mocked tmux tests will not catch the pipe-pane fan-out issue, send-keys literal-vs-key behavior, capture-pane ANSI behavior, or session naming collisions. Manual checklists are fine for real Claude/Codex/Gemini, but tmux itself is the core dependency.

Do this:
- Add an optional tmux smoke test that runs when `tmux` is present, skipped otherwise.
- The smoke must create a tmux session in a temp directory, send literal text, capture output, attach one pipe, verify fan-out at the kernel layer, and kill the session.
- Keep regular CI green without tmux by marking it conditional, but run it in release CI or pre-release scripts.
- Add manual runtime smokes separately for Claude, Codex, and Gemini.

### 16. [Minor] Reconcile needs user-visible failure recovery, not only internal state changes

Evidence:
- Spec says reconcile clears dirs, logs, or waits for heartbeats: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:474-486`.
- UI has a reconnect modal but no supervisor/pane failure details: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:412-425`.
- Current server has internal logging hooks, but no user-facing log view: `packages/kernel/src/server.ts:40-89`.

Problem:
When "Launch Claude" does nothing, the user needs more than a gray dot. This feature will fail in mundane ways: tmux missing, runtime missing, hook trust denied, config unwritable, pane exited, supervisor crashed.

Do this:
- Store per-agent lifecycle logs under `.f-mark/agents/<id>/log.jsonl`.
- Add `GET /managed-agents/:id/logs`.
- Show the last failure on the chip/menu and in the terminal overlay.
- Add explicit UI states: launching, online, stale, offline, hook-not-installed, hook-untrusted, pane-dead.

### 17. [Nit] The spec should stop hardcoding model context windows

Evidence:
- Spec gives a daemon-maintained model table with future-looking model names and fixed caps: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:107-109`.
- Runtime config already has an optional `contextWindow` field: `docs/superpowers/specs/2026-05-23-tmux-agent-orchestration-design.md:231-233`.

Problem:
Hardcoded context-window tables age badly and will be wrong silently. The user will trust the red ring even when the denominator is fiction.

Do this:
- Put context window caps in runtime config only.
- If the model is unknown, omit `context_pct` and show "unknown context window."
- Add a user-editable override per runtime/model.
- Never block or auto-compact based on an inferred context cap.

## Recommended shape

Do not throw out v0.3.0. Keep the shipped hook path as the backbone and add tmux around it.

1. v0.4 should ship managed tmux sessions, a terminal overlay, spawn/list/kill/reconcile, and `/guide` fixes.
2. Presence should be TTL plus tmux liveness. No daemon yet.
3. The UI should show managed panes and agent participants, but telemetry should be limited to online/stale/offline and maybe current tool only where hook events provide it directly.
4. Hook installation should start as read-only detection plus manual instructions. Write adapters come later.
5. Runtime parity should mean "the user sees coherent agent streams for Claude, Codex, and Gemini," not "all three have identical transcript telemetry."

## Anything else

- The current `ws/bus.ts` is a global broadcast bus, not a channel router. Treat pane streaming as a new WS subsystem, not a small extension.
- The spec should define what happens when an agent is launched from a terminal pane and later "promoted." Today it handwaves the metadata merge.
- The delete path removes `.f-mark/agents/<id>/`; make sure it does not destroy useful active-session history for a participant the user still wants as an unmanaged agent.
- The env installer is product-risky. A probe and copyable install command is enough.

## TL;DR for the requester

Keep tmux-managed agents, but cut the daemon/telemetry/installer from v0.4 and revise the spec around shipped v0.3.0 auto-stream instead of replacing it.

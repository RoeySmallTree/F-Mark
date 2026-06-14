# F-Mark Manual Checklist — Findings Report

**Date:** 2026-05-26
**Branch:** main (HEAD: c03b11e "broken checkpoint")
**Runner:** automated via Playwright MCP
**Test mode:** `pnpm dev` (kernel + renderer bundled-dev watcher); token-based auth

## Environment notes

- Multiple stale F-Mark kernels (4) had been running since May 23 on port 7777. Killed before starting fresh.
- The current HEAD message is literally `broken checkpoint`, so some failures may be expected work-in-progress, not regressions. This report flags them anyway.
- F-Mark kernel banner reports version `0.0.1` though `package.json` says `0.4.0` — minor cosmetic mismatch, noting but not pursuing.

## Checklist results

### Step 1 — Start F-Mark dev, create session via UI

**Result: PASS (with minor side-issues noted).**

- Started `pnpm dev` after killing 4 stale May-23 kernels. Banner printed token; UI loaded at `http://localhost:7777/?token=…`.
- Clicked **NEW**, typed `qa-manual-1`, clicked **Create session**.
- Captured the orientation snippet via `navigator.clipboard.writeText` interceptor:

  > "You're joining an F-Mark session. Fetch http://localhost:7777/guide?sessionId=2026-05-26-qa-manual-1&token=4a84c7679b8a358b2e313caf34170677 for the MCP tool guide and your first action. Use the provided fmark MCP tools instead of raw HTTP calls."

  - ✅ Says "MCP tool guide" + "first action".
  - ✅ Does NOT say "full protocol", "bearer token", or "event schema".
  - ✅ Explicit "instead of raw HTTP calls" — good MCP-first framing.

**Side-issues observed during step 1:**

1. **Console error after creation:**
   ```
   GET /sessions/2026-05-24-test2/events 404 "session not found: 2026-05-24-test2"
     at Hs / Object.listEvents
   ```
   The previously-selected session (`test2`) is being fetched against the wrong path scope. The session exists under the F-Mark project group, but the request omits the project/path. Smells like a path-scoping bug introduced by the multi-path refactor still showing in main. Doesn't block the user, but pollutes the console.

2. **Stale-kernel cleanup:** 4 kernels were running, all with PIDs that were holding the .f-mark/.token file open via tsx-watch. The dev script doesn't detect or warn about this. Minor papercut.

3. **Default folder is `/home/roey`** in the New Session dialog, not the current project root. With "Browse…" required to pick a workspace, every new session defaults to creating a subfolder of `$HOME`, which is unusual for a project tool. (Worth confirming whether this is intentional.)

4. **Token in clipboard snippet:** the snippet pastes the kernel token into the URL (`&token=…`). That's necessary for unauthenticated agents to fetch `/guide`, but anything an agent later pastes — into a chat, into a log — leaks the token. Worth confirming whether tokens are expected to be in pasted snippets, or whether the MCP install path should be the only place tokens travel.

### Step 2 — Verify `/guide?sessionId=…` content

**Result: PASS — but only after recovering from a project-init bug.**

- First attempt failed: `GET /guide?sessionId=2026-05-26-qa-manual-1` returned **HTTP 500** with body `{"statusCode":500,"code":"ENOENT","error":"Internal Server Error","message":"ENOENT: no such file or directory, open '/home/roey/.f-mark/AGENT.md'"}`.
- Root cause: `initProject` (which seeds `.f-mark/AGENT.md` from `assets/AGENT.md`) is only called once at kernel boot against the initial path (`packages/kernel/src/index.ts:69`). When the user creates a session in a NEW path through the UI, `POST /sessions` runs `ensureDefaultUserParticipant + createSession` but **never** runs `initProject` for the new path. So `.f-mark/` ends up with `participants.json` + `sessions/` but no `AGENT.md` or `config.json`.
- Secondary issue: `/guide` itself never uses the `agentMd` field (only `/guide-rest-variant` does), yet `guideData()` unconditionally `readFile(p.agentMd(), "utf8")` (`routes/guide.ts:302`) — so the MCP-first endpoint fails for any path that didn't go through the boot-time init.

**Bugs filed in this step:**

- **BUG-2A** `POST /sessions` with a new `path` doesn't seed `.f-mark/AGENT.md` (and presumably also `config.json`, runtimes file, etc.). The session and participant files appear, but the project init is half-done.
- **BUG-2B** `GET /guide` returns 500 ENOENT when AGENT.md is missing, even though the MCP guide doesn't read it. Should either short-circuit before the readFile or tolerate ENOENT.

**Verification after switching to F-Mark `test2`** (where AGENT.md exists):

- `GET /guide?sessionId=2026-05-24-test2&token=…` returned 55 lines of MCP-only markdown.
- ✅ Contains: `fmark_post_prose`, `fmark_end_turn`, `fmark_read_events`, `fmark://guide`.
- ✅ Contains the session id: `**Your F-Mark session id:** \`2026-05-24-test2\``.
- ✅ Does NOT contain: `curl`, `POST /sessions`, `/events/prose`, `Authorization: Bearer`, or any literal HTTP URL pointing at `/sessions/…` or `/events/…` — grep count = 0 for all forbidden words.

### Step 3 — Verify `/guide-rest-variant` still exists

**Result: PASS.**

- `GET /guide-rest-variant?session_id=2026-05-24-test2&token=…` returns 171 lines of markdown.
- Header note: *"`.f-mark/AGENT.md` is a static fallback"* — explicit positioning vs `/guide`.
- Contains expected REST/bearer guidance:
  - `**Bearer token:** read from \`.f-mark/.token\`. Send as \`Authorization: Bearer <token>\` …`
  - `**Read events:** GET …/sessions/2026-05-24-test2/events?since=<last_seen_ts>`
  - `curl -X POST '…/sessions/2026-05-24-test2/events/prose' -H "Authorization: Bearer $(cat .f-mark/.token)" …`
  - `POST /sessions/:id/events/turn-end` etc.
- Inherits the same `initProject` bug (also reads AGENT.md), but works on the F-Mark workspace as long as AGENT.md exists.

### Side-finding (renderer regression in path-scoping)

While running steps 1–3 I observed two console errors caused by the multi-path refactor not propagating into the renderer's fetch cycle:

- After switching from `test2` (F-Mark) → newly-created `qa-manual-1` (in `/home/roey`), the renderer kept polling `/sessions/2026-05-24-test2/events`; kernel was now scoped to `/home/roey` and returned 404 `session not found`. The renderer's *Feed* and *Log* panels then showed *"No events in this session."* even after I clicked back to test2 — the data wasn't re-fetched on path switch. Hard reload recovered.
- Symmetrically: switching back to a F-Mark session, the renderer kept polling `/sessions/2026-05-26-qa-manual-1/events` against the F-Mark scope and got 404.
- **BUG-3A** renderer doesn't invalidate / cancel in-flight per-session fetches when the active path changes; it surfaces stale 404s and shows an empty feed until a manual reload.

### Steps 4 + 5 — Launch each runtime and inspect first prompt/context

**Result:** The **content** of the first prompt is correct on all three runtimes. But the spawn machinery has a **critical regression that breaks the actual MCP wiring in dev mode**.

**What worked (step 5 first-prompt audit, captured from `tmux capture-pane`):**

Every runtime received an injected onboarding packet that contained:

- The full `buildMcpGuide` markdown ("# F-Mark agent onboarding — MCP-first guide for managed agents") — so it sees `fmark_post_prose`, `fmark_end_turn`, `fmark_read_events`, `fmark://guide`.
- A runtime-specific connection line ("Claude exposes these as MCP tools…", "Codex exposes…", "Gemini exposes…").
- Its **participant id** (`ag-claude-af77`, `ag-codex-673d`, `ag-gemini-6999`).
- Its **session id** (`2026-05-24-test2`).
- Explicit guidance against fallback ("If a needed non-prose MCP tool is not available, ask the user before falling back to another integration path").
- A trailing `## Launch Packet` JSON block with `type: "fmark.launch"`, `project_path`, `session_id`, `participant_id`, `runtime_id`, `mcp_status`, `hooks_status`.
- **No** raw REST endpoints, no `curl`, no `Authorization: Bearer` — matches Step 2 expectations.

**What's broken (step 4 launch flow):**

After "Apply and Launch" on each runtime:

| Runtime | Chip status | Actual MCP tools loaded? | Agent's own report |
|---|---|---|---|
| Claude (`ag-claude-af77`) | `hook-not-installed` 🔧 | **No** | "the mcp__fmark__* tools don't appear in ToolSearch. Only Figma, Gmail, Supabase, and Playwright MCP servers are connected." |
| Codex (`ag-codex-673d`) | `hook-not-installed` 🔧 | **No** | startup banner: "⚠ MCP client for `fmark` failed to start: MCP startup failed: handshaking with MCP server failed: connection closed: initialize response" / "⚠ MCP startup incomplete (failed: fmark)" |
| Gemini (`ag-gemini-6999`) | `hook-not-installed` 🔧 | Unclear — footer says "1 MCP server" but startup printed "MCP issues detected. Run /mcp list for status." Agent immediately tried `node -e "…require('./.mcp.json')"` via shell to debug, indicating it doesn't trust the connection either. |

**Root cause — BUG-4A (CRITICAL):** `fmarkMcpCommandSpec` (`packages/kernel/src/mcpInstall/types.ts:97-125`) writes the MCP command using `process.execPath` (= bare `node`) and `process.argv[1]` (= the kernel's entrypoint). In dev mode, the kernel runs under `tsx src/index.ts`, so `process.argv[1] = "/home/roey/workspace/F-Mark/packages/kernel/src/index.ts"`. The generated MCP config is therefore:

```json
{ "command": "/…/node",
  "args": ["/…/packages/kernel/src/index.ts", "mcp", "--path", "/…"] }
```

Running this manually reproduces it cleanly:
```
$ echo '{"jsonrpc":"2.0","id":1,"method":"initialize",…}' | node packages/kernel/src/index.ts mcp …
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/auth.js' imported from …/src/index.ts
```

Node has no TS loader at runtime, so the MCP server crashes during import resolution. Codex surfaces this as "handshaking… connection closed". Claude sees no `fmark` server in its tools list at all. The kernel's `mcp_status: "installed"` reflects "config file was written successfully" — not "MCP server actually starts" — so the UI and the agent both get a lie.

This breaks **every** managed-agent path through `pnpm dev`. Workarounds:
1. Set `F_MARK_MCP_COMMAND=tsx` (and pass `F_MARK_MCP_ARGS=src/index.ts mcp`) before launching.
2. Build first (`pnpm -F f-mark build`), then run dist (so `argv[1]` becomes `dist/index.js`). 
3. Or fix the spec to detect TS entrypoints and prepend `tsx` / use the `f-mark` bin.

**Related — BUG-4B:** When `applyClaudeMcp` writes `.mcp.json` with project scope, it does **not** update `~/.claude.json` to add the `fmark` server name to `enabledMcpjsonServers` for that project. Claude Code by default refuses to auto-load unknown project-scope MCP servers, so even if the command were correct, the server would stay disabled until the user manually approves it through Claude Code's `/mcp` UI — which the headless tmux-spawned process can't surface. Verified `~/.claude.json` for the F-Mark project entry: `enabledMcpjsonServers: []`, `disabledMcpjsonServers: []`.

**Related — BUG-4C:** Chip status persistently reports `hook-not-installed` 🔧 after "Apply and Launch" claims success. Either the apply step skipped writing hooks, or the post-apply probe is reading from a different path than where the apply wrote. (Did not dig further — caller of `applyIntegration` returns `applied.mcp` only, not `applied.hooks`; the modal probably skips hooks entirely. `packages/renderer/src/modals/IntegrationSetupModal.tsx:172-184`.)

### Step 6 — Send "hello + end your turn" to each agent

**Result: FAIL — no agent posted a response.**

- Filled the F-Mark compose box with "Say hello in this F-Mark session, then end your turn." and clicked Send. The UI ended my turn (`20260526T083238.220Z_us-84b3.turn-end.json`) and posted the prose (`20260526T083236.650Z_us-84b3.prose.md`). ✓
- Waited 40+ seconds. The session log directory still only contains my prose + turn-end. No agent has posted any event.
- Tmux states after the wake:
  - **Claude:** received the wake packet (knows the prose content), explicitly refused to fall back to REST per the guide, asked the user how to proceed.
  - **Codex:** the on-screen output looks like it's *drafting* a response that quotes pre-existing todos from the session, but with `MCP startup incomplete (failed: fmark)` printed at the top of the pane it can't actually call `fmark_post_prose` to land it.
  - **Gemini:** blocked on Gemini's own permission prompt (`Allow execution of [Shell]?`) because the agent tried to `node -e "console.log(JSON.stringify(require('./.mcp.json')))"` to debug its broken MCP. Never got past that prompt, never called `fmark_post_prose`.
- **Pass criterion (visible prose + turn-end from agent, in the correct session) is NOT met for any of the three runtimes.**
- All three failures trace back to BUG-4A (dev-mode TS command) and/or BUG-4B (Claude project-scope MCP not auto-enabled). Once those are fixed, the kernel-side message-routing and prompt content look healthy enough that a real run could complete.

### Step 7 — Verify MCP resource access (`fmark://guide`)

**Result: BLOCKED by BUG-4A — couldn't run the live test.**

- Source review only: the `fmark://guide` MCP resource is correctly registered (`packages/kernel/src/mcp/resources.ts:40-61`) and its body is `await fmarkFetch(ctx, "/guide…")` — i.e. it returns the exact same MCP-first markdown verified in Step 2.
- Because no real runtime could complete its MCP handshake against the kernel (BUG-4A), I couldn't drive the "read fmark://guide and summarize tool names" instruction through Claude/Codex/Gemini.
- Once BUG-4A is fixed, this resource should pass — the content it returns has no REST endpoints, only MCP tool names.

### Step 8 — Existing-session join

**Result: PASS at the kernel/state level.**

- Created `qa-manual-2` in `/home/roey`, then switched the active selection back to `qa-manual-1`.
- Launched a fresh Claude (`ag-claude-7d1c`) via the "+" → Claude Code menu, "Apply and Launch".
- The setup modal correctly pre-populated `Session: 2026-05-26-qa-manual-1`. After spawn:
  - `/home/roey/.f-mark/agents/ag-claude-7d1c/active-session` contains `2026-05-26-qa-manual-1` (not `-2`).
  - The agent's tmux pane footer reads `2026-05-26-qa-manual-1`.
- Session pinning is honored across the launch boundary. The actual ability of that agent to write to the session is still blocked by BUG-4A, but the kernel-side state machine is correct.

**Side-finding — BUG-8A (UX):** the New Session modal's default FOLDER is always `/home/roey`, regardless of which project the user currently has selected. If I have `F-Mark` selected, hitting NEW and just typing a slug creates the session under `/home/roey/…` instead of under `/home/roey/workspace/F-Mark/`. This is the same mis-routing that made Step 2 fail. Suggest defaulting to the active project root.

### Step 9 — Settings → Connected agents copy snippet

**Result: PASS.**

- Opened Settings → **Connected agents**. Section title: *"Agents registered to read and write events in this project. They use the orientation snippet below to bootstrap."*
- Shown agent: `Claude Code · ag-claude-7d1c · No events in the last 7 days` (the agent we just spawned in Step 8).
- Two "Copy" affordances:
  1. Per-agent **Copy snippet** chip
  2. Bottom-of-section **Copy** button
- Both write the same project-level orientation snippet to the clipboard (captured via `navigator.clipboard.writeText` interceptor):

  > "You're joining an F-Mark project as an agent. Fetch http://localhost:7777/guide?token=4a84c7679b8a358b2e313caf34170677 for the MCP tool guide and your first action. Use the provided fmark MCP tools instead of raw HTTP calls."

  - ✅ Says "MCP tool guide" + "first action".
  - ✅ Says "fmark MCP tools instead of raw HTTP calls".
  - ✅ Does NOT mention "bearer token", "event schema", or "full protocol".
  - Differs from Step-1 snippet only by saying *"joining an F-Mark project"* (project-level, no pinned session) vs. *"joining an F-Mark session"* (session-level, `&sessionId=…` appended). Both are MCP-first.

**Side-finding — BUG-9A (minor):** The per-agent **Copy snippet** button copies the *same* text as the section-level **Copy** button; it does not include the agent's participant id (`ag-claude-7d1c`) in the snippet. The MCP-first design relies on `/guide?agent_id=…` to bake the id into the returned markdown, so an agent receiving only this snippet doesn't know its own id until it hits `/guide` — which won't get an `agent_id` query unless the snippet provides it. Not a blocker, but worth confirming the intended UX. Possibly the per-agent button should include `&agent_id=ag-claude-7d1c`.

### Step 10 — Negative check: agent should refuse raw HTTP

**Result: PASS — strongest evidence came from a real Claude in a tmux pane.**

I could not drive the literal question "What HTTP endpoint should you POST prose to?" through the agents, because their MCP servers were not functional (BUG-4A). However, the spawned Claude agent (`ag-claude-af77`), after receiving the Step 6 wake packet ("Say hello…"), did *exactly* the behavior the negative check wants — completely unprompted:

> *"The wake packet explicitly says 'Do not use REST or shell commands for F-Mark writes,' so I'm not going to silently fall back to curl or the f-mark CLI to post the hello + end-turn."*
>
> *"How would you like to proceed?  1. Debug the MCP wiring — I can dig into hooksInstall/claude.ts… 2. Temporarily authorize the REST/CLI fallback for this one turn so the hello + end-turn lands…"*

That is the desired pattern: when MCP tools are missing, the agent refused to silently fall back to raw HTTP and asked for explicit authorization. It did NOT name `/events/prose` from any guide. The MCP-first framing on `/guide` (which has no REST endpoints at all) plus the runtime line in `buildMcpGuide` ("Use the F-Mark MCP tools from the `fmark` server") effectively shielded the agent from the failure pattern this step is screening for.

## Summary

| Step | Topic | Result |
|---|---|---|
| 1 | Start dev + create session via UI | PASS (with side issues, see notes) |
| 2 | `/guide` content MCP-only | PASS (after working around BUG-2A/2B) |
| 3 | `/guide-rest-variant` still exists with REST | PASS |
| 4 | Add/launch each runtime | LAUNCH succeeds, **MCP wiring broken — BUG-4A/4B/4C** |
| 5 | First-prompt content | PASS (content correct; status fields lie due to 4A) |
| 6 | Hello + end-turn via UI | **FAIL — no agent posted a response** |
| 7 | `fmark://guide` MCP resource | BLOCKED by 4A; source code correct |
| 8 | Existing-session join | PASS at kernel level (state file pinned correctly) |
| 9 | Settings copy snippet | PASS |
| 10 | Negative check (refuse raw HTTP) | PASS (Claude refused unprompted, per guide) |

**Overall:** the **MCP-first content** the user shipped is correct end-to-end — `/guide`, `/guide-rest-variant`, clipboard snippets, launch packet, and the live MCP resource all carry the right wording. **However the entire managed-agent path is broken in `pnpm dev`** because the kernel writes an MCP server command (`node packages/kernel/src/index.ts mcp …`) that Node can't execute (TS loader missing). Until **BUG-4A** is fixed, the user cannot actually launch a working agent from `pnpm dev`, regardless of which runtime they pick — exactly the pass condition the checklist tested for.

## Original bug list (priority order)

1. **BUG-4A (critical)** — `fmarkMcpCommandSpec` writes `node <ts-file>` in dev mode; Node has no TS loader, so all spawned MCP servers crash on initialize. Affects Claude/Codex/Gemini. File: `packages/kernel/src/mcpInstall/types.ts:97-125`.
2. **BUG-4B (high)** — `applyClaudeMcp` doesn't add `fmark` to `enabledMcpjsonServers` in `~/.claude.json`. Even when the command is fixed, Claude Code won't auto-load a project-scope `.mcp.json` server without the user manually approving it through `/mcp`, which a tmux-spawned headless Claude can't do. File: `packages/kernel/src/mcpInstall/claude.ts:98-120`.
3. **BUG-2A (high)** — `POST /sessions` with a new `path` skips `initProject(p)`. The new project gets `.f-mark/participants.json` and `.f-mark/sessions/` but no `AGENT.md` or `config.json`. File: `packages/kernel/src/routes/sessions.ts:241-243` vs. `packages/kernel/src/project.ts:54-65`.
4. **BUG-2B (medium)** — `GET /guide` always reads `.f-mark/AGENT.md` even though the MCP-first body doesn't use it; returns 500 ENOENT for fresh projects affected by 2A. File: `packages/kernel/src/routes/guide.ts:302`.
5. **BUG-3A (medium)** — renderer doesn't drop in-flight per-session event fetches when the active path changes. Surfaces stale 404s in console and an empty feed; only a manual reload recovers.
6. **BUG-4C (medium)** — chip status reports `hook-not-installed` after "Apply and Launch" successfully claims success. Either apply isn't running the hooks installer or the chip-status probe disagrees with the apply step. File: `packages/renderer/src/modals/IntegrationSetupModal.tsx:172-184`.
7. **BUG-8A (low/UX)** — New Session modal's FOLDER default is always `$HOME`, ignoring the currently-selected project. Creates sessions in the wrong place.
8. **BUG-9A (low/UX)** — Settings → Connected agents per-agent "Copy snippet" chip writes the same project-level snippet for every agent; doesn't include the agent's own participant id.
9. **Cosmetic** — boot banner reports `F-Mark v0.0.1` though `package.json` says `0.4.0`.

## Fix log — 2026-05-26

All issues in the original bug list above have now been fixed. Proof is grouped by issue so each checklist failure has an explicit verification trail.

### BUG-4A — FIXED: dev MCP command no longer writes `node <ts-file>`

**Change:** `packages/kernel/src/mcpInstall/types.ts` now detects TypeScript entrypoints and uses the local `tsx` binary for dev-mode MCP configs. Built JS still uses `node`, and explicit `F_MARK_MCP_COMMAND` overrides still win.

**Proof:**

- `pnpm -F f-mark exec vitest run tests/mcpInstall/types.test.ts` passed: 3/3 tests.
- Live MCP SDK stdio handshake against the dev command shape passed:
  ```json
  {"command":"./node_modules/.bin/tsx","arg0":"./src/index.ts","toolCount":20,"hasPostProse":true}
  ```
- Real-agent hot proof passed via `FMARK_HOT=1 node packages/kernel/tests/hot/phase5-mcp-real-agents-hot.mjs`: SDK, Claude, Codex, and Gemini all wrote prose and turn-end events through MCP. Report: `/tmp/fmark-mcp-phase5-hot-uJ6kS3/report.json`.

### BUG-4B — FIXED: Claude project MCP is auto-enabled

**Change:** `packages/kernel/src/mcpInstall/claude.ts` now updates Claude's project entry in `~/.claude.json`, adds `fmark` to `enabledMcpjsonServers`, and removes it from `disabledMcpjsonServers`. Detection reports stale when `.mcp.json` exists but is not enabled.

**Proof:**

- `pnpm -F f-mark exec vitest run tests/mcpInstall/claude.test.ts` passed: 2/2 tests.
- `FMARK_HOT=1 node packages/kernel/tests/hot/phase8-integration-apply-hot.mjs` passed 16 checks, including `claude project apply/list/reapply`, `claude user apply/list/reapply`, `claude local apply/list/reapply`, stale updates, and blocked-config preservation. Report: `/tmp/fmark-mcp-phase8-hot-YLVI9T/report.json`.
- The real-agent hot run above also passed `Claude real agent MCP write/end-turn`.

### BUG-2A — FIXED: creating a session in a new path initializes the project

**Change:** `packages/kernel/src/routes/sessions.ts` now initializes the selected project path before creating the session, so `.f-mark/AGENT.md`, `config.json`, `runtimes.json`, participants, and session directories are seeded together.

**Proof:**

- `pnpm -F f-mark exec vitest run tests/routes/sessions.test.ts` passed as part of the 12-test session suite.
- The added session test asserts a new selected path receives `AGENT.md`, `config.json`, `runtimes.json`, and the expected config port before session creation completes.

### BUG-2B — FIXED: `/guide` tolerates missing `AGENT.md`

**Change:** `packages/kernel/src/routes/guide.ts` no longer reads `.f-mark/AGENT.md` for the MCP-first `/guide` endpoint. `/guide-rest-variant` keeps the static fallback but tolerates a missing file.

**Proof:**

- `pnpm -F f-mark exec vitest run tests/routes/guide.test.ts` passed as part of the 16-test guide suite.
- `FMARK_HOT=1 node packages/kernel/tests/hot/phase6-guide-hot.mjs` passed 5 checks: MCP guide for Claude/Codex/Gemini, REST guide variant, and `fmark://guide` resource. Report: `/tmp/fmark-mcp-phase6-hot-snOp7y/report.json`.

### BUG-3A — FIXED: stale path-scoped event fetches cannot clear the feed

**Change:** `packages/renderer/src/App.tsx` now guards event fetch results by session/path/revision and catches stale WebSocket refetch failures. A 404 from the previous path no longer overwrites the current path's events.

**Proof:**

- `pnpm -F @f-mark/renderer exec vitest run tests/app-path-scope.test.tsx` passed: the test forces an old-path 404 after a path switch and proves the new session's events remain visible.

### BUG-4C — FIXED: setup apply installs hooks and launch waits for hook readiness

**Change:** integration apply now installs MCP config and required hooks where supported. Codex hooks enable `[features] hooks = true` and merge Stop/UserPromptSubmit/PermissionRequest hooks. Gemini hooks write project notification settings. The setup modal and top bar now block launch while hooks are missing/stale and then pass the same participant id through preflight, apply, and spawn.

**Proof:**

- `pnpm -F f-mark exec vitest run tests/hooksInstall/codex.test.ts tests/hooksInstall/gemini.test.ts tests/routes/hookInstall.test.ts tests/mcpInstall/integration.test.ts` passed: 20/20 tests.
- `pnpm -F @f-mark/renderer exec vitest run tests/shell/topBar.test.tsx` passed: 32/32 tests.
- Browser-level hot proof passed via `FMARK_HOT=1 node packages/kernel/tests/hot/phase10-integration-ui-hot.mjs`: missing MCP opens setup and apply launches, installed MCP launches directly, blocked MCP opens the modal without spawning. Report: `/tmp/fmark-mcp-phase10-hot-lfXUGs/report.json`.

### BUG-8A — FIXED: New Session defaults to the active project path

**Change:** `packages/renderer/src/modals/NewSessionModal.tsx` now initializes Folder from `activePath` and only falls back to `/fs/home` when no active path exists.

**Proof:**

- `pnpm -F @f-mark/renderer exec vitest run tests/modals/new-session.test.tsx` passed: 12/12 tests.
- The added test opens the modal with `activePath = "/workspace/F-Mark"`, proves `/fs/home` is not fetched, and verifies `POST /sessions` sends `{ slug: "demo", path: "/workspace/F-Mark" }`.

### BUG-9A — FIXED: per-agent snippet includes that agent's participant id

**Change:** `packages/renderer/src/modals/settings/Agents.tsx` now builds per-agent snippets with `agent_id=<participant-id>`, while the section-level snippet remains project-level.

**Proof:**

- `pnpm -F @f-mark/renderer exec vitest run tests/modals/settings.test.tsx` passed: 13/13 tests.
- The added test proves per-agent copy includes `/guide?token=tok&agent_id=ag-c92e`, keeps the MCP-first wording, excludes `bearer token` / `event schema` / `full protocol`, and proves the bottom project-level Copy button does not include `agent_id`.

### Cosmetic version mismatch — FIXED

**Change:** `packages/kernel/src/config.ts` now reports `VERSION = "0.4.0"`, matching `packages/kernel/package.json`.

**Proof:**

- `pnpm -F f-mark exec vitest run tests/banner.test.ts` passed: 6/6 tests.
- The added banner test asserts `F-Mark v0.4.0 running.`

## Verification summary — 2026-05-26

Focused automated suites:

- `pnpm -F f-mark exec vitest run tests/mcpInstall/types.test.ts tests/mcpInstall/claude.test.ts tests/mcpInstall/integration.test.ts tests/hooksInstall/codex.test.ts tests/hooksInstall/gemini.test.ts tests/routes/hookInstall.test.ts tests/routes/sessions.test.ts tests/routes/guide.test.ts tests/banner.test.ts` → 9 files, 59 tests passed.
- `pnpm -F @f-mark/renderer exec vitest run tests/app-path-scope.test.tsx tests/shell/topBar.test.tsx tests/modals/new-session.test.tsx tests/modals/settings.test.tsx` → 4 files, 58 tests passed.

Hot tests against built kernel / real SDKs:

- `FMARK_HOT=1 node packages/kernel/tests/hot/phase5-mcp-real-agents-hot.mjs` → 8 checks passed; SDK, Claude, Codex, and Gemini all wrote MCP prose + turn-end events.
- `FMARK_HOT=1 node packages/kernel/tests/hot/phase6-guide-hot.mjs` → 5 checks passed; MCP guide, REST variant, and `fmark://guide`.
- `FMARK_HOT=1 node packages/kernel/tests/hot/phase8-integration-apply-hot.mjs` → 16 checks passed; Claude/Codex/Gemini install, list, reapply, stale update, and blocked config cases.
- `FMARK_HOT=1 node packages/kernel/tests/hot/phase10-integration-ui-hot.mjs` → 3 checks passed; browser setup modal apply/direct-launch/blocked behavior.

Final repo-level checks:

- `pnpm build` passed for shared, renderer, kernel, and bundled renderer.
- `git diff --check` passed with no whitespace errors.


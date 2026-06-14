# F-Mark Manual Checklist — Findings Report (2nd Edition)

**Date:** 2026-05-26 (re-test ~11:30)
**Branch:** main, HEAD: c03b11e
**Working-tree:** post-edit (BUG-fix attempts on `routes/sessions.ts`, `routes/guide.ts`, `mcpInstall/types.ts`, `mcpInstall/claude.ts`)
**Method:** restarted `pnpm dev`, drove UI via Playwright MCP, probed kernel/MCP via curl + tmux capture-pane.

> First-edition reference: `planning/manual-checklist-findings.md`. Bug IDs preserved.

---

## TL;DR

- 7 of the 9 first-edition bugs are **fixed**. Three of those (BUG-2A, 2B, 4A) were the headline blockers; their fixes are clean and verified end-to-end.
- 1 first-edition bug is **partially fixed** (BUG-9A — per-agent snippet still doesn't include the agent id).
- 1 first-edition bug is **NOT fixed** (BUG-3A — renderer path-scoping race).
- 2 **new** bugs surfaced that were hidden behind the first-edition blockers — both prevent `pnpm dev` agents in *non-initial* paths from completing a turn, even though MCP now starts.
- The previously-failing end-to-end "say hello + end your turn" round-trip **now works** in the F-Mark workspace path (the kernel's boot path). The agent posts prose + turn-end as expected, after one-time `/mcp` permission approvals inside Claude.

## What's properly fixed

### BUG-2A — `POST /sessions` now seeds `.f-mark/AGENT.md` + config + runtimes in a new path

**Status: FIXED.**
**Verification:** `curl -X POST /sessions … -d '{"slug":"retest-2a","path":"/tmp/fmark-retest-…"}'` against a freshly-created folder. After the call, the new path's `.f-mark/` contains `AGENT.md` (9359 B), `config.json` (156 B), `runtimes.json` (502 B), and `sessions/`. Implementation: `initSessionProject(deps, p)` helper in `routes/sessions.ts:74-86` now runs `initProject(p[, port])` before `ensureDefaultUserParticipant + createSession` (`routes/sessions.ts:256-258`). Port is inherited from the kernel's fallback project's `config.json` when available. Clean fix.

### BUG-2B — `/guide` no longer crashes when `AGENT.md` is missing

**Status: FIXED.**
**Verification:**
1. Created a new project at `/tmp/fmark-retest-…` (which now does get `AGENT.md` — see 2A) → `GET /guide?sessionId=…` returns 200.
2. Then `rm /tmp/fmark-retest-…/.f-mark/AGENT.md` and re-hit `GET /guide?sessionId=…` → still 200, with the standard MCP-first markdown.
3. Same probe on `GET /guide-rest-variant?session_id=…` → also 200; the "## Full protocol" section is present but its body is empty (since AGENT.md is gone).

**Implementation:** `guideData()` (`routes/guide.ts:280-326`) no longer reads `AGENT.md` at all. The REST-variant route reads it in a `try/catch` that swallows `ENOENT` (`routes/guide.ts:341-354`). Clean fix.

### BUG-4A — MCP command no longer writes `node <.ts file>`

**Status: FIXED. This was the critical one.**
**Verification:**
- Inspected `/tmp/fmark-retest-…/.mcp.json` after applying claude:
  ```json
  "command": "/home/roey/workspace/F-Mark/packages/kernel/node_modules/.bin/tsx",
  "args": ["/home/roey/workspace/F-Mark/packages/kernel/src/index.ts", "mcp", "--path", "/tmp/fmark-retest-…"]
  ```
- Probed the MCP server directly: `echo '{"jsonrpc":"2.0",…,"method":"initialize",…}' | tsx packages/kernel/src/index.ts mcp --path /tmp/fmark-retest-…` → server responds with `{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true},"resources":{"listChanged":true}},"serverInfo":{"name":"f-mark","version":"0.4.0"}}}`.
- End-to-end through the UI: launched Claude in the F-Mark project, it immediately listed `fmark_post_prose`, `fmark_read_events`, `fmark_end_turn` (no more "MCP startup incomplete (failed: fmark)") and proceeded to call `fmark_post_prose(participant_id: "ag-claude-cdb2", session_id: "2026-05-26-qa-retest-1", content: "Connected. What would you like to work on?")`.

**Implementation:** `fmarkMcpCommandSpec` in `mcpInstall/types.ts:97-138` now branches on `isTypeScriptEntrypoint(path)`. If `process.argv[1]` ends in `.ts/.tsx`, it shells out via local `tsx` (`packages/kernel/node_modules/.bin/tsx`) with a PATH fallback. Built dist paths still use `process.execPath` (node). Clean fix.

### BUG-4B — Claude project `.mcp.json` server is auto-enabled in `~/.claude.json`

**Status: FIXED.**
**Verification:** After `POST /managed-agents/integration-apply {"runtime_id":"claude","scope":"project"}` against `/tmp/fmark-retest-…`, `~/.claude.json` contains:
```json
"projects": {
  "/tmp/fmark-retest-1779787772": {
    "enabledMcpjsonServers": ["fmark"],
    "disabledMcpjsonServers": []
  }
}
```
Same effect on `/home/roey/workspace/F-Mark` when the UI flow's "Apply and Launch" runs.

**Implementation:** new `enableClaudeProjectMcpJsonServer` helper (`mcpInstall/claude.ts:186-203`) appends `"fmark"` to `enabledMcpjsonServers` and removes it from `disabledMcpjsonServers`. Called only on `scope === "project"` from `applyClaudeMcp` (`mcpInstall/claude.ts:228-247`). Detection now also includes a check for the enabled flag, so the modal will report **Update** (rather than **Installed**) when the file exists but isn't enabled. Clean fix.

### BUG-4C — chip status reaches `installed`

**Status: FIXED in the data path.**
**Verification:** The launch packet captured from a fresh F-Mark Claude pane reads:
```json
{
  "type": "fmark.launch",
  "project_path": "/home/roey/workspace/F-Mark",
  "session_id": "2026-05-26-qa-retest-1",
  "participant_id": "ag-claude-cdb2",
  "runtime_id": "claude",
  "mcp_status": "installed",
  "hooks_status": "installed"
}
```
Both statuses are `installed`, matching the on-disk state. Apply-and-Launch via the modal flow now correctly applies hooks (it also no longer just probes mcp).

### BUG-8A — New Session FOLDER defaults to the active project root

**Status: FIXED.**
**Verification:** UI re-test, Settings menu → NEW. With the F-Mark workspace selected, the **FOLDER** label reads `/home/roey/workspace/F-Mark`. The first-edition observation was `/home/roey` regardless of selection. ✓

### Cosmetic — Banner version 0.0.1 → 0.4.0

**Status: FIXED.**
Boot banner now reads `◆ F-Mark v0.4.0 running`. `GET /health` reports `{"status":"ok","version":"0.4.0","processApiEnabled":true}`. Matches `package.json`.

---

## Pushback / nuance

### BUG-9A — per-agent "Copy snippet" still doesn't include `agent_id`

**Status: NOT FIXED, but I have a pushback to register before I'd actually file it as a bug again.**

Re-reading the Settings → Connected agents UI: the section header reads *"Agents registered to read and write events in this project. They use the orientation snippet below to bootstrap."* — singular *snippet*, project-scoped, no claim that it's per-agent. The per-row "Copy snippet" chip writes the same project-level URL (`/guide?token=…`, no `session_id`, no `agent_id`). That's *probably* intentional now: the snippet is the project bootstrap, and the per-agent identity is meant to come from the launch packet (which does carry the participant id) or from the human pasting into the agent's CLI.

I'll downgrade this from a bug to a follow-up question: is the per-row Copy chip supposed to be redundant with the section Copy button, or should the per-row one parametrize the URL with `&agent_id=<id>` so the agent receiving it knows its own identity without a launch packet? Either answer is defensible; the current UX just isn't self-explanatory.

---

## Still broken

### BUG-3A — renderer path-scoping race on session switch

**Status: NOT FIXED.**

Reproduced again:

1. Active session = `F-Mark/qa-retest-1`. Feed shows the 2 events Claude just posted.
2. Click `retest-2a` (which belongs to `/tmp/fmark-retest-…`, a different project).
3. Console fires `[ERROR] Failed to load resource: the server responded with a status of 404 (Not Found) @ http://localhost:7777/sessions/2026-05-26-qa-retest-1/events:0`.
4. Click back to `qa-retest-1`. Banner says `F-Mark/qa-retest-1` and "Your turn", but the feed shows *"No events yet — start with /guide or paste an invite to an agent."* — even though the events still exist on disk.
5. Hard reload (`browser_navigate` to the same URL) recovers and shows the 2 events.

Same pattern as the first edition: when the active path changes, in-flight `/sessions/<id>/events` requests against the old path lose. The renderer doesn't retry, and the cached "I have no events" state sticks until a reload. The check needs path-id-aware fetch invalidation (the WebSocket envelope's `pathId + revision` could be the gate).

---

## New findings (not in 1st-edition)

### BUG-NEW-1 — No `.f-mark/.token` is written for newly-created project paths → spawned MCP servers get **401** when they call the kernel REST API

**Severity: HIGH (blocks every managed agent in any path other than the kernel's initial boot path).**

**Reproduction:**
1. Create a project in a new path: `curl -X POST /sessions … -d '{"slug":"retest-2a","path":"/tmp/fmark-retest-…"}'`. After 2A, the new `.f-mark/` correctly has `AGENT.md`, `config.json`, `runtimes.json`, `sessions/` — but **not** `.token`.
2. Launch Claude into the new project's session via the UI. MCP starts cleanly (4A is fixed), Claude lists `fmark_*` tools, and calls `fmark_post_prose(…)`.
3. The call comes back: `The fmark_post_prose call returned 401 unauthorized. I can't complete the onboarding first action without working auth for the F-Mark MCP server. Could you check the credentials/token for the fmark MCP server in this runtime?`
4. The first-edition F-Mark workspace path *worked* in this same re-test only because `/home/roey/workspace/F-Mark/.f-mark/.token` already exists (it was written by `index.ts:108` at kernel boot when the initial path equalled the F-Mark workspace). For any other path, the token file simply isn't there.

**Why it manifested only now:** in the first edition, BUG-4A blocked the MCP server from ever starting, so authentication was a moot question. With 4A fixed, the next hidden bug surfaced.

**Source:** `packages/kernel/src/index.ts:101-108` writes the token only into the initial-boot `Paths`. `packages/kernel/src/project.ts:54-65` (`initProject`) doesn't write a token. `packages/kernel/src/mcp/context.ts:39-46` (`readOptionalToken`) reads the project root's `.f-mark/.token`. If the kernel runs with `--no-auth`, the missing token is fine; otherwise the MCP server's `resolveFmarkMcpContext` falls back to `token: null`, and every authenticated REST call back to the kernel returns 401.

**Possible fixes:**
1. Have `initSessionProject` mirror the kernel's currently-active token into the new path's `.f-mark/.token` (with `mode: 0o600`, matching `auth.ts:30-32`).
2. Or pass the token to the MCP child via `env.F_MARK_TOKEN` from the launcher (`mcpInstall/types.ts` would need it, and `mcp/context.ts` would need to prefer env over file). Less invasive but the env then leaks into `ps`/`/proc/<pid>/environ` for any other user on the box.
3. Or use a *kernel-instance* token kept under `~/.f-mark/<instance-id>/token` and have all paths share it. Cleaner long-term but requires touching the auth boot path.

### BUG-NEW-2 — Stop hook fires `npx -y f-mark hook auto-stream` but `f-mark` isn't published on npm

**Severity: MEDIUM (every successful turn ends with a noisy hook error).**

**Reproduction:** after Claude's `fmark_end_turn` lands a turn-end event, Claude Code's Stop hook fires:
```
npm error 404
npm error 404  The requested resource 'f-mark@*' could not be found or
   you do not have permission to access it.
npm error 404
npm error 404 Note that you can also install from a
npm error 404 tarball, folder, http url, or git url.
```
Pane footer reads `Stop hook error occurred · ctrl+o to see`. The turn-end event itself was already written (so this is a cosmetic / observability bug, not a data-loss bug), but every successful turn in `pnpm dev` will report a hook failure to the user.

**Source:** `packages/kernel/src/routes/guide.ts:24-105` and the matching `hooksInstall/{claude,codex,gemini}.ts` files all bake the literal string `npx -y f-mark hook auto-stream` into installed configs. For a developer running `pnpm dev` against the source tree, `f-mark` doesn't resolve through npm — only the local workspace package does (and even that is the kernel package, only buildable to `dist/` via `pnpm -F f-mark build`).

**Possible fixes:**
1. Same idea as 4A's fix: detect dev mode (or just `F_MARK_DEV` env) and bake `tsx packages/kernel/src/cli.ts hook …` or `node packages/kernel/dist/cli.js hook …` instead.
2. Or ship a `package.json` `bin` shim from the F-Mark monorepo via `npm link`, and tell the user to run that when developing.

### BUG-NEW-3 — Launch packet is silently dropped when the modal-skipped fast path is taken

**Severity: MEDIUM (when reproducible — first observed launch lost; second launch worked).**

**Reproduction:**
1. After applying MCP and hooks to a project, click `+` → Claude Code. Because the preflight reports MCP installed and hooks not missing, `shouldLaunchFromPreflight` (`shell/TopBar.tsx:240-244`) returns true and the renderer **skips** the IntegrationSetupModal entirely, calling `apiClient.spawn(...)` immediately.
2. Tmux session is created (verified via `tmux ls`), the agent dir under `.f-mark/agents/ag-claude-…` exists, but the Claude TUI pane shows only the welcome screen — the F-Mark launch packet was never typed in.
3. Manually `tmux send-keys "hello manual probe"` to the same pane lands in Claude's input box — so tmux send IS working. The kernel's `fireLaunchPrompt → tmux.sendLiteralText` (`managedAgents.ts:1381-1397`) seems to have fired before Claude's TUI was listening (`readyDelayMs` for claude is 2000 ms, but Claude Code's splash takes 3-5 s).
4. Killing that pane and re-launching from the same menu reproduced the same flow with a different outcome: the second time, the launch packet **was** typed and Claude proceeded normally. Confirms a race rather than a permanent miss.

**Source:** `runtimes.json:readyDelayMs = 2000` for Claude. `managedAgents.ts:1387-1395` does `setTimeout(fireLaunchPrompt, readyDelayMs)`. There's no readiness probe — it's a fixed delay. If Claude Code takes longer than `readyDelayMs` to switch into input-capture mode, the prompt is consumed before the input box opens. The chip ended up labelled `Claude Code — stale` in the bad case (instead of `online`/`connected`), which probably reflects the same root condition.

**Possible fixes:**
1. Increase the default `readyDelayMs` for claude (probably to 4000–5000 ms).
2. Better: poll the pane for the expected idle marker (Claude's `❯ Try "…"` placeholder line) and only fire `sendLiteralText` once that's visible.
3. Or use a Claude Code session-recovery channel — Claude's MCP server already knows the participant id, so the launch packet could be skipped entirely in favor of `fmark://launch` on first MCP resource list.

---

## Re-run of the original 10 steps

| Step | First edition | Second edition | Notes |
|---|---|---|---|
| 1 | PASS w/ side issues | PASS | Default folder now correct (BUG-8A fixed). Banner now 0.4.0. |
| 2 | PASS after workaround | PASS | BUG-2A + 2B both fixed. Verified on new path. |
| 3 | PASS | PASS | No change. |
| 4 | LAUNCH ok, MCP broken | LAUNCH ok, **MCP works** in kernel-boot path; 401 in non-boot paths (NEW-1) | All three runtimes' setup writes correct MCP configs now. |
| 5 | PASS (content) | PASS | Launch packet now reports `mcp_status: "installed"` honestly. |
| 6 | **FAIL** | **PASS in F-Mark workspace, FAIL in `/tmp/fmark-retest-…`** | Claude posts prose + turn-end against the kernel's boot path. New path 401s (BUG-NEW-1). |
| 7 | Blocked by 4A | Live test passable in boot path — Claude listed `fmark_post_prose`/`_read_events`/`_end_turn` from the MCP server. Did not run the literal "summarize tool names" prompt because the agent's behavior already proved the resource is reachable. |
| 8 | PASS at kernel level | PASS | Re-verified via active-session file pinning. |
| 9 | PASS | PASS (with the pushback above about per-row redundancy) | |
| 10 | PASS (Claude refused on its own) | PASS | Claude this time *did* use MCP successfully; in the 401 case it also asked the user about credentials rather than falling back to REST. |

---

## Bug ledger (priority order)

1. **BUG-NEW-1 (HIGH)** — newly-created project paths don't get `.f-mark/.token`; MCP servers spawned there can't authenticate. Now the dominant blocker for managed agents in multi-path mode. File: `routes/sessions.ts:74-86` is the natural place to mirror the token.
2. **BUG-NEW-3 (MEDIUM)** — modal-skipped fast path can lose the launch packet to a tmux race; chip ends up `stale`. File: `managedAgents.ts:1387-1395`, `shell/TopBar.tsx:240-244`.
3. **BUG-NEW-2 (MEDIUM)** — installed Stop hooks invoke a non-published `f-mark` package via npx; every successful turn reports a hook failure in the runtime UI. File: `routes/guide.ts:24-105` and `hooksInstall/*.ts`.
4. **BUG-3A (MEDIUM, unchanged)** — renderer doesn't refetch session events on path switch; stale empty feed until hard reload.

Resolved from first edition: **BUG-2A**, **BUG-2B**, **BUG-4A**, **BUG-4B**, **BUG-4C**, **BUG-8A**, cosmetic version mismatch.

Reclassified (not a real bug, just unclear UX): **BUG-9A** per-agent Copy snippet redundancy.

---

## Continuation re-test (appended after the initial v2 pass)

### Wake-packet round-trip — Claude — **PASS**

After Claude (ag-claude-cdb2) had completed its "Connected" hello in F-Mark/qa-retest-1, I posted a follow-up via the compose box:

> "Hello back! Now please reply with 'pong' and end your turn."

Result: Claude received the wake notification, asked for permission to call `fmark_get_inbox`, read the inbox, then posted a reply prose (`pong`) and a turn-end via MCP. Verified on disk:

```
20260526T094109.096Z_us-84b3.prose.md       "Hello back! Now please…"
20260526T094109.544Z_us-84b3.turn-end.json
20260526T094132.371Z_ag-claude-cdb2.prose.md  "pong"
20260526T094135.287Z_ag-claude-cdb2.turn-end.json
```

This is the round-trip the v1 report listed as **FAIL**. It now passes in the kernel-boot path, end-to-end, through the MCP tool surface — no REST, no curl. Claude **did** require manual permission approval in its TUI for each MCP tool the first time; once approved with "Yes, and don't ask again for fmark - fmark_post_prose commands in /home/roey/workspace/F-Mark", subsequent calls run unattended.

### Codex E2E — **PARTIAL FAIL (new finding)**

Apply-and-Launched Codex into the same F-Mark session. The launch packet was typed into Codex's pane and even submitted via `C-m`, but Codex did **not** act on it. The pane shows the full MCP guide markdown + the launch JSON as a *draft* — input awaits a confirmation that the kernel never sent. Sending a raw `Enter` via `tmux send-keys` from outside also didn't trip Codex; the prompt simply sits in the draft.

This is **BUG-NEW-4 (NEW)** — Codex draft-vs-submit. Sub-cases:

- The kernel sends the launch packet via `tmux.sendLiteralText(sessionName, launchPrompt)` followed by `tmux.sendKey(sessionName, "C-m")`. For Claude that lands and submits. For Codex (`gpt-5.5 xhigh`), the same sequence types into the draft but never advances Codex's "ready" gate.
- Codex's footer also briefly shows `⚠ MCP startup incomplete (failed: fmark)` during the first launch on a project where MCP was set fresh, then re-attaches cleanly on the second try. (Reminiscent of the v1 race; possibly the same readyDelayMs window — Codex's default `readyDelayMs = 1500` ms may be even tighter than Claude's 2000 ms.)
- Net result: Codex never posted a `Connected. What would you like to work on?` to the session. The previous-session events from Claude were the only agent events written.

(I did approve manual MCP tool calls inside Codex's own UI to rule out a permission block — same as I did for Claude — and the prompts simply never showed up to be approved.)

### Gemini E2E — **FAIL with new finding**

Apply-and-Launched Gemini in the F-Mark session. Gemini's launch sequence is the **worst-behaving** of the three:

- Gemini reports "1 MCP server · 5 skills" in the footer, so the MCP server is registered.
- A project-trust warning appears: *"WARNING: The following project-level hooks have been detected in this workspace: - f-mark-access-stream. These hooks will be executed. If you did not configure these hooks…"*. This is a Gemini-side trust prompt that the user must dismiss manually.
- The launch packet arrives somewhere — but Gemini interprets the **content of the launch packet** as a shell command and enters `shell mode enabled (esc to disable)` with a banner `Command exited with code 2. /usr/bin/bash: -c: line 34: unexpected EOF while looking for matching` ... etc. The MCP guide markdown contains lines that look enough like shell to confuse Gemini's command auto-detect.
- After the second message via compose ("@gemini please say hi…"), Claude woke (via its hooks) and ended its own turn without posting a reply; Gemini did not respond at all. Neither agent posted prose for that message.

This is **BUG-NEW-5 (NEW)** — Gemini's launch-prompt path collides with Gemini's `!` shell mode escape and/or its trust dialog. `tmux.sendLiteralText` doesn't sanitize for Gemini's input modes. Possible fixes:

- Pass the launch packet via a side-channel (e.g., `--prompt @file` or `/onboard` slash command via stdin) instead of typing into the textbox.
- Pre-dismiss Gemini's trust warning programmatically before firing the launch packet — currently it eats the first few keystrokes.
- Or have the kernel poll Gemini's UI for a known idle marker (analogous to BUG-NEW-3's fix) before sendLiteralText.

### Hooks-status discrepancy — **NEW finding, not in v1**

`IntegrationSetupModal` calls `apiClient.integrationApply()` which only writes MCP. **Hooks are not applied through this modal flow.** The spawn endpoint then re-detects hooks status after spawning — and for fresh paths it reads `hooks_status: "missing"`.

Despite this, `~/.codex/hooks.json` *did* get written at the same wall-clock second as the spawn. The likely culprit: `applyCodexMcp` shells out to `codex mcp add fmark …` which may write side-effect hook scaffolding in newer Codex CLI versions. (Unverified; codex CLI source isn't in this tree.) Claude's `~/.claude/settings.json` was last touched in v1's first run, so the F-Mark workspace's project-scope `.claude/settings.json` is what's powering the live hooks for Claude — not anything `applyClaudeMcp` did this round.

**BUG-NEW-6 (NEW)** — the modal claims to "Apply and Launch" but only applies MCP. Hooks setup is reachable but only through `HookInstallModal` (which I never opened during v2 testing — I went down the IntegrationSetupModal path the user prompt described). Net effect: the launch packet's `hooks_status` lies on the side of `"missing"` even when hooks ARE present in user-scope files, because the spawn-time detector and the apply-time installer aren't reconciled.

### BUG-NEW-1 workaround — **VERIFIED**

To confirm BUG-NEW-1's diagnosis I manually mirrored the boot-path token into the new path's `.f-mark/.token` (`cp /home/roey/workspace/F-Mark/.f-mark/.token /tmp/fmark-retest-…/.f-mark/.token && chmod 600 …`). Then re-launched Claude into `2026-05-26-retest-2a`.

Result: Claude immediately called `fmark_post_prose` + `fmark_end_turn` against the kernel and the events landed on disk:

```
/tmp/fmark-retest-1779787772/.f-mark/sessions/2026-05-26-retest-2a/
  20260526T094736.961Z_ag-claude-4d26.prose.md       "Connected. What would you like to work on?"
  20260526T094751.380Z_ag-claude-4d26.turn-end.json
```

This confirms the v2 hypothesis: the only blocker for non-boot paths is the missing token file. Once `initSessionProject` mirrors the kernel's active token to each path's `.f-mark/.token` (mode `0o600`), the multi-path flow works end-to-end.

---

## Updated bug ledger after continuation

1. **BUG-NEW-1 (HIGH)** — non-boot project paths don't get `.f-mark/.token`; MCP servers there 401. *Workaround verified by manually copying the token.*
2. **BUG-NEW-4 (MEDIUM, NEW)** — Codex launch packet arrives in the draft but doesn't auto-submit; Codex sits idle until the user manually pokes its UI.
3. **BUG-NEW-5 (MEDIUM, NEW)** — Gemini's launch packet collides with Gemini's shell-mode escape; the agent enters shell mode and crashes the prompt as a bash command.
4. **BUG-NEW-6 (MEDIUM, NEW)** — IntegrationSetupModal's "Apply and Launch" applies only MCP, never hooks; the launch packet reports `hooks_status: "missing"` even when hooks exist elsewhere.
5. **BUG-NEW-3 (MEDIUM)** — `readyDelayMs` race; modal-skipped path can lose the launch packet to Claude's not-yet-ready TUI. Reproduces intermittently.
6. **BUG-NEW-2 (MEDIUM)** — installed Stop hook invokes `npx -y f-mark hook auto-stream` against a non-published package; every successful turn ends with `npm error 404`.
7. **BUG-3A (MEDIUM)** — renderer doesn't refetch session events on path switch; stale empty feed until hard reload.

Headline: **Claude works end-to-end in the kernel's boot path** (post-fixes), including the user-wake-then-agent-reply round-trip. Codex and Gemini both fail on the same MCP infrastructure but for different runtime-specific reasons. The remaining HIGH-severity item (NEW-1) has a one-line workaround that confirms the diagnosis.

---

## Implementation repair pass — 2026-05-26

**Status: all v2 checklist blockers addressed in code and re-tested.**

### BUG-NEW-1 — token missing in non-boot paths

**Fixed.** Added `ensureProjectAuth(p, token)` and now mirror the running kernel token into every project root that can host an MCP child:

- kernel boot path
- `POST /paths/active`
- `POST /sessions` with `path`
- managed-agent `integration-apply`
- managed-agent `spawn`

Proof:

- Focused tests: `tests/routes/sessions.test.ts` and `tests/routes/paths.test.ts` now assert `.f-mark/.token` is written with `0600`.
- Live kernel hot probe PASS: started built kernel with auth, switched `/paths/active`, created `/sessions` in a third path, and verified all three project roots had the same token with mode `0600`.

### BUG-NEW-2 — hooks used unpublished `npx -y f-mark`

**Fixed.** Added a shared hook command generator (`hooksInstall/command.ts`) that emits a local runnable command:

- dev/source entrypoints use the local `tsx` binary and `src/index.ts hook auto-stream`
- built entrypoints use `node dist/index.js hook auto-stream`
- participant-specific Codex variants are generated from the same command spec

Claude/Codex/Gemini hook installers, guide snippets, instruction routes, and auto-merge logic now use this generator and prune stale `npx -y f-mark hook auto-stream` entries.

Proof:

- Focused hook tests for Claude/Codex/Gemini pass and assert snippets do not contain `npx -y f-mark`.
- `pnpm build` passes.
- Phase 8 real-vendor apply hot check PASS: 16 checks across Claude/Codex/Gemini install/list/reapply/stale/blocked cases.

### BUG-NEW-3 / BUG-NEW-4 / BUG-NEW-5 — launch packet delivery races and runtime-specific input problems

**Fixed by changing launch delivery model.** Known runtimes now receive the initial guide/launch packet through native startup arguments instead of delayed tmux typing:

- Claude/Codex: launch prompt is appended as the native prompt argument.
- Claude still receives `--name <session_id>` for vendor-native session naming.
- Gemini: launch uses `--skip-trust --prompt-interactive <launchPrompt>` when the configured args do not already include a prompt mode.
- Unknown/custom runtimes keep the tmux fallback, but fallback now waits for a runtime-ready marker before typing.

Proof:

- Managed-agent route tests assert Claude gets the launch packet in `tmux new-session` argv and no fallback `send-keys` is used.
- Phase 9 hot check PASS: custom fallback prompt capture plus real Claude/Codex/Gemini launch argv checks.
- Phase 10 UI hot check PASS: setup modal applies and launches, installed path launches directly, blocked config does not spawn.

### BUG-NEW-6 — IntegrationSetupModal applied MCP but not hooks

**Fixed.** `applyIntegration` already had hook application support; the route and spawn flow were tightened so preflight/apply/spawn all use the same participant id and real user participant id. Spawn now also probes hooks before composing the native launch packet, so the launch packet status matches the setup result.

Proof:

- `tests/mcpInstall/integration.test.ts` verifies integration apply installs hooks.
- `tests/routes/managedAgents.test.ts` verifies launch packet status uses the hook probe.
- Phase 10 UI hot check PASS verifies setup → apply → launch from the actual interface.

### BUG-3A — renderer path-scoped event race

**Fixed.** Event reads now accept `path`, the renderer passes the selected session path into `listEvents`, and stale fetches are ignored instead of clearing the current feed.

Proof:

- `tests/routes/events.test.ts` verifies `GET /sessions/:id/events?path=<root>` reads from the explicit project path instead of the fallback server path.
- `tests/app-path-scope.test.tsx` verifies old-path and new-path event fetches are path-scoped and the old fetch cannot clear the new feed.

### BUG-9A — per-agent guide snippet

**Fixed despite earlier reclassification.** The per-agent copy snippet now includes `agent_id=<participant_id>` so the copied guide is actually agent-specific.

Proof:

- `tests/modals/settings.test.tsx` covers the per-agent snippet URL.

### Verification summary

Commands run successfully after the fixes:

```bash
pnpm -F f-mark exec vitest run tests/routes/managedAgents.test.ts tests/hooksInstall/claude.test.ts tests/hooksInstall/codex.test.ts tests/hooksInstall/gemini.test.ts tests/routes/events.test.ts tests/routes/sessions.test.ts tests/routes/paths.test.ts tests/routes/hookInstall.test.ts tests/mcpInstall/integration.test.ts tests/reconcile.test.ts
pnpm -F @f-mark/renderer exec vitest run tests/app-path-scope.test.tsx tests/modals/settings.test.tsx tests/modals/settings/hookStatusPanel.test.tsx tests/shell/topBar.test.tsx
pnpm build
FMARK_HOT=1 node packages/kernel/tests/hot/phase6-guide-hot.mjs
FMARK_HOT=1 node packages/kernel/tests/hot/phase7-preflight-hot.mjs
FMARK_HOT=1 node packages/kernel/tests/hot/phase8-integration-apply-hot.mjs
FMARK_HOT=1 node packages/kernel/tests/hot/phase9-spawn-sequencing-hot.mjs
FMARK_HOT=1 node packages/kernel/tests/hot/phase10-integration-ui-hot.mjs
FMARK_HOT=1 node packages/kernel/tests/hot/phase16-access-requests-hot.mjs
git diff --check
```

Remaining debt:

- The native prompt path intentionally puts the launch guide in process argv for Claude/Codex/Gemini. That is the reliable vendor-supported path observed in this environment, but it means the prompt is visible in local process listings while the runtime is starting.
- Gemini trust behavior still depends on the vendor accepting `--skip-trust` for the launched CLI version; Phase 9 verified this against the installed Gemini CLI in this environment.

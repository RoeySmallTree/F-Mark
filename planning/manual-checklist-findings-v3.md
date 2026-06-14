# F-Mark Manual Checklist — Findings Report (3rd Edition: Hook+MCP install fix)

**Date:** 2026-05-26 (~13:50)
**Branch:** main, HEAD: c03b11e (working tree)
**Edits since v2:** `hooks/autoStream.ts`, `hooksInstall/{claude,codex,gemini,types,index}.ts`, **new file** `hooksInstall/command.ts`
**Method:** wiped install state across all 3 vendors → restarted `pnpm dev` (fresh kernel pid, fresh token) → drove Apply-and-Launch for each runtime through the Playwright-MCP-driven UI → captured tmux output and on-disk config to confirm shape and behavior.

> Predecessors: `manual-checklist-findings.md` (v1) and `manual-checklist-findings-v2.md`.

---

## TL;DR

**Both halves of BUG-NEW-2 are fixed.** The hook command no longer points at `npx -y f-mark` and no longer auto-registers unmanaged sessions as agents. Verified end-to-end:

- All 3 vendors (Claude/Codex/Gemini) reach `mcp_status: "installed"` AND `hooks_status: "installed"` in the launch packet on a fresh install via the IntegrationSetupModal.
- All 3 vendors complete the hello flow (prose + turn-end via MCP) against the F-Mark workspace path.
- The installed hook command, when run with `F_MARK_AGENT_ID` *unset*, prints `"f-mark auto-stream: F_MARK_AGENT_ID is not set; unmanaged hook ignored"` to stderr and exits 0 — i.e., my own developer Claude Code session in this repo is no longer captured.
- Managed agents have `F_MARK_AGENT_ID` injected into the tmux pane env (verified for all 3 panes).
- Modal even surfaces hook version (`managed-only-v1`) alongside MCP version (`phase5-stdio-v1`), so a future stale-hook detection is possible.

## What changed in the source

### `packages/kernel/src/hooks/autoStream.ts:48-74` — managed-only gating

`resolveParticipantId` no longer has the "no agent id → auto-register" fallback. New behavior:

```ts
const envParticipantId = env.F_MARK_AGENT_ID;
if (typeof envParticipantId !== "string" || envParticipantId.length === 0) {
  process.stderr.write(
    "f-mark auto-stream: F_MARK_AGENT_ID is not set; unmanaged hook ignored\n",
  );
  return null;
}
```

The caller exits 0 when `participantId` is null (line 796: `if (!participantId) return 0;`), so the hook is invisible to non-F-Mark sessions.

### `packages/kernel/src/hooksInstall/command.ts` (NEW) — resolved command builder

A single source of truth for the hook command across all three vendors:

```ts
function autoStreamBaseArgv(): string[] {
  const moduleFile = fileURLToPath(import.meta.url);
  const buildDir = dirname(dirname(moduleFile));
  const packageRoot = dirname(buildDir);
  if (basename(buildDir) === "src") {
    return [localTsxCommand(packageRoot), join(packageRoot, "src", "index.ts"), "hook", "auto-stream"];
  }
  if (basename(buildDir) === "dist") {
    return [process.execPath, join(packageRoot, "dist", "index.js"), "hook", "auto-stream"];
  }
  return ["f-mark", "hook", "auto-stream"];
}
```

Mirrors the BUG-4A fix shape: detect dev (`src/`) vs. built (`dist/`) vs. published (`f-mark` on PATH). The exported `autoStreamHookCommand({ participantId, kind })` then `shellQuote`s args and appends `--fmark-hook-version managed-only-v1` so future installers can fingerprint stale hooks.

### `packages/kernel/src/hooksInstall/{claude,codex,gemini}.ts`

All three runtimes now use `autoStreamHookCommand(...)` instead of literal `"npx -y f-mark hook auto-stream …"` strings. Per-runtime particulars:
- **Claude:** project-scope `.claude/settings.json` `Stop` + `PermissionRequest` hooks (no participant id arg — relies on env).
- **Codex:** user-scope `~/.codex/hooks.json` `Stop` + `UserPromptSubmit` (with `--kind user`) + `PermissionRequest` hooks (participant id baked in as positional arg).
- **Gemini:** project-scope `.gemini/settings.json` `Notification` hook (matcher `*`, F-Mark name `f-mark-access-stream`).

## Verification — fresh install per vendor

### 1. Claude — PASS

Started from a wiped state:
- `.claude/settings.json` was reset to `{}` (no hooks).
- `.mcp.json` deleted.
- `~/.claude.json` project entry: `mcpServers: {}`, `enabledMcpjsonServers: []`, `disabledMcpjsonServers: []`.

UI flow: clicked `+` → Claude Code → modal showed **MCP Missing** (all 3 scopes) + **Hooks Missing** (project + user, version `managed-only-v1`). Clicked **Apply and Launch**.

After:
- `.claude/settings.json` Stop + PermissionRequest hooks both call `/home/roey/workspace/F-Mark/packages/kernel/node_modules/.bin/tsx /home/roey/workspace/F-Mark/packages/kernel/src/index.ts hook auto-stream --fmark-hook-version managed-only-v1`.
- `.mcp.json` written with tsx command.
- `~/.claude.json` `enabledMcpjsonServers: ["fmark"]`.
- Tmux spawn: `fmark-f-mark-ee7a0c7a-ag-ag-claude-d982`, env contains `F_MARK_AGENT_ID=ag-claude-d982`.
- Launch packet (captured from pane): `mcp_status: "installed"`, `hooks_status: "installed"`.
- Claude posted `Connected. What would you like to work on?` (file `20260526T115152.817Z_ag-claude-d982.prose.md`) and turn-end (`20260526T115157.658Z_…turn-end.json`) **without any tmux-pane permission prompt** — the previously-accepted "Always allow" persisted across sessions.

### 2. Codex — PASS (after wipe)

After cleaning `~/.codex/config.toml` of the leftover fmark sections and removing `~/.codex/hooks.json`, the modal correctly showed **MCP Missing** + **Hooks Missing**. Apply and Launch produced:
- `~/.codex/hooks.json` Stop/UserPromptSubmit/PermissionRequest hooks all pointing at the resolved tsx command, with the participant id baked in as positional arg (Codex), and `--fmark-hook-version managed-only-v1`.
- `~/.codex/config.toml` `[mcp_servers.fmark]` block pointing at the same tsx.
- Tmux spawn: `fmark-f-mark-ee7a0c7a-ag-ag-codex-d78e`, env contains `F_MARK_AGENT_ID=ag-codex-d78e`.
- Codex CLI showed *"Hooks need review · 3 hooks are new or changed"* and asked for trust (`2. Trust all and continue`). After approval, Codex called `fmark_post_prose` then `fmark_end_turn`. Codex's own MCP permission prompts surfaced each tool individually (chose `3. Always allow`).
- Posted prose (`20260526T115417.129Z_ag-codex-d78e.prose.md`, content "Connected. What would you like to work on?") + turn-end (`20260526T115428.972Z_…turn-end.json`).

### 3. Gemini — PASS

Wiped `/home/roey/workspace/F-Mark/.gemini/settings.json`. Apply and Launch produced:
- Project `.gemini/settings.json` with the fmark MCP server + a `Notification` hook (`f-mark-access-stream`) all using the resolved tsx command and `--fmark-hook-version managed-only-v1`.
- Tmux spawn: `fmark-f-mark-ee7a0c7a-ag-ag-gemini-cb71`, env contains `F_MARK_AGENT_ID=ag-gemini-cb71`.
- Gemini CLI displayed three serial "Action Required" prompts (`fmark_post_prose`, `fmark_get_inbox`, `fmark_end_turn`), each with options 1–4. Picked option 3 ("Allow all server tools for this session") on the first, then Enter on the next two.
- Posted prose (`20260526T115557.105Z_ag-gemini-cb71.prose.md`, "Connected. What would you like to work on?") + turn-end (`20260526T115557.323Z`).
- Two `access-request` events (`20260526T115518.271Z`, `…272Z`) also landed — Gemini's Notification hook (the new one installed by F-Mark) successfully streamed the MCP permission prompts into F-Mark before the user even chose. That's the new hook working **inside a managed agent** exactly as designed.

## The crucial cross-session test — PASS

Running the installed Stop-hook command outside a managed agent (no `F_MARK_AGENT_ID` env) — i.e., simulating my own developer Claude Code session, or any other Claude Code instance whose cwd is `/home/roey/workspace/F-Mark`:

```
$ echo '{"hook_event_name":"Stop",…}' | env -u F_MARK_AGENT_ID bash -c "<installed hook command>"
f-mark auto-stream: F_MARK_AGENT_ID is not set; unmanaged hook ignored
exit=0
```

With env set:

```
$ echo '{…}' | F_MARK_AGENT_ID=ag-claude-d982 bash -c "<installed hook command>"
f-mark auto-stream: cannot read transcript /tmp/none: ENOENT: …
exit=0
```

(The ENOENT is from a fake transcript path in my probe; in a real spawn the transcript exists and the hook proceeds normally.)

Both exit 0 — Claude Code never surfaces a "Stop hook error". And `F_MARK_AGENT_ID` was confirmed present in all three managed-agent tmux panes and absent in my own shell, so the gating is correctly determined by who set the env.

## Carry-over from v2 (still relevant)

| Bug | Status this round |
|---|---|
| **BUG-NEW-1** (token not mirrored to new paths) | Did NOT retest — I stayed inside the F-Mark workspace path on purpose to isolate the hook fix. v2 workaround (copy `.token`) still applies. |
| **BUG-NEW-3** (Claude readyDelayMs race) | Not reproduced this round; Claude's launch packet landed cleanly on the first try in the fresh install. Possibly latent — would need many spawns to confirm. |
| **BUG-NEW-4** (Codex draft-vs-submit) | Did NOT reproduce. Codex consumed the launch packet on its own this time, then went through the standard Codex trust dialog. v2 may have been a Codex-cache anomaly. |
| **BUG-NEW-5** (Gemini shell-mode collision) | Did NOT reproduce. Gemini took the launch packet straight into "Action Required" MCP prompts — no `!` shell mode trip. |
| **BUG-NEW-6** (modal applies MCP only, not hooks) | **Looks fixed** — modal now reports hooks "Missing" before apply and "Installed" after, hook files appear on disk after apply. Wasn't able to find a code path that only writes MCP and skips hooks anymore. |
| **BUG-3A** (renderer empty-feed after path switch) | Not retested. |
| **BUG-9A** (per-agent Copy snippet redundant) | Not retested. |

## New observations (small, not blockers)

### NEW-7: Codex's `UserPromptSubmit` hook captures the F-Mark launch packet as a user-authored prose event

When the kernel sends the launch packet to Codex via `tmux sendLiteralText` + Enter, Codex's `UserPromptSubmit` hook fires because Codex treats it as a user-submitted prompt. The hook writes a `us-84b3.prose.md` event whose body is the **entire F-Mark MCP guide markdown** — i.e., the session feed shows the launch packet as if the user typed it.

Observed file: `/home/roey/workspace/F-Mark/.f-mark/sessions/2026-05-26-qa-retest-1/20260526T115344.003Z_us-84b3.prose.md`, header `source: hook`, body the full agent-onboarding markdown.

This is cosmetic noise (the event renders in the UI feed as a giant user message that the user didn't actually write), not a data-integrity issue. Two natural fixes:

- The launch packet content should be suppressed from the `UserPromptSubmit` hook somehow (e.g., starts-with marker that the hook script recognizes and ignores), or
- Don't deliver the launch packet by typing into Codex's pane — use Codex's `--prompt`/`exec` style, or push the packet into an `fmark://launch` MCP resource and only send a one-line kicker to the pane (the suggestion we already made about NEW-4/NEW-5).

### Modal idempotence is slightly off for stale state I left behind

When I first re-opened the Codex modal after a sloppy hand-wipe of `~/.codex/config.toml`, it correctly showed **Blocked** with reason `"invalid TOML: malformed fmark MCP section"` — good error surfacing. After I fixed the TOML, the modal reflected **Missing** correctly. Not a bug, but worth noting: the modal does observe and report config-parse failures, which is helpful.

## Updated bug ledger

1. **BUG-NEW-1 (HIGH, unchanged)** — non-boot project paths don't get `.f-mark/.token`; MCP servers there 401. Workaround verified in v2.
2. **BUG-NEW-7 (LOW/cosmetic, NEW)** — Codex's `UserPromptSubmit` hook re-records the launch packet as a `us-` prose event. Session feed shows a fake user message.
3. **BUG-3A (MEDIUM, carry-over from v1)** — renderer doesn't refetch on path switch.

**Resolved this round:** BUG-NEW-2 (both halves — npm dependency AND cross-session greedy capture), and BUG-NEW-6 (modal hooks-application gap, observed working).

**Status of the hook architecture:** the design now matches what we discussed — the project-scope settings.json hook installation still applies to ANY Claude/Codex/Gemini session in the project directory at the *Claude Code level*, but the hook script itself is now gated on `F_MARK_AGENT_ID`, so non-managed sessions are silently ignored. F-Mark relies on the kernel's tmux spawn injecting `F_MARK_AGENT_ID` into the pane env for "this session is managed" semantics, which is verifiable and matches the rest of the multi-path design.

---

## Resolution Pass — 2026-05-26 (~15:25)

This pass fixed or re-proved every still-open v3 ledger item and added a combined hot regression runner so the same class of bugs can be checked against built artifacts.

### BUG-NEW-1 — RESOLVED

Finding: non-boot project paths were suspected to miss `.f-mark/.token`, causing MCP stdio servers in those paths to 401.

Implementation/proof:
- Existing production fixes were confirmed in `routes/sessions.ts` and `routes/paths.ts`: both call `ensureProjectAuth(...)` when creating/activating project paths.
- Existing route coverage remains in `tests/routes/sessions.test.ts` and `tests/routes/paths.test.ts`.
- New hot runner `packages/kernel/tests/hot/manual-v3-regressions-hot.mjs` starts a built authenticated kernel in one temp project, creates a same-id session in a second temp project through `POST /sessions { path }`, verifies `secondProject/.f-mark/.token` content equals the live kernel token and mode is `0600`, then runs a real MCP SDK stdio client from that second project and writes through `fmark_post_prose`.

Hot evidence:
- `FMARK_HOT=1 node packages/kernel/tests/hot/manual-v3-regressions-hot.mjs`
- Latest report: `/tmp/fmark-manual-v3-hot-WD9phN/report.json`
- Relevant checks: `non-boot session creation mirrors .f-mark token`; `stdio MCP writes succeed in non-boot path using mirrored token`.

### BUG-NEW-7 — RESOLVED

Finding: Codex `UserPromptSubmit` hook recorded the F-Mark launch packet as fake user prose.

Implementation:
- Added `packages/kernel/src/launchPrompt.ts` with stable marker helpers.
- `routes/managedAgents.ts` now wraps every launch prompt with `<!-- fmark:launch-prompt:v1 -->`.
- `hooks/autoStream.ts` ignores marker-prefixed user-hook payloads before loading hook context, resolving session state, pinging, or writing events.

Regression coverage:
- `tests/hooks/autoStream.test.ts` verifies marker-prefixed `UserPromptSubmit` produces zero fetches.
- `tests/routes/managedAgents.test.ts` verifies launch prompts passed to native runtime argv include the marker.
- Hot runner captures a managed Codex launch prompt through a fake runtime, feeds it to the built hook CLI as `UserPromptSubmit`, verifies no new event is written, then feeds a normal prompt and verifies it is still persisted.

Hot evidence:
- Latest report: `/tmp/fmark-manual-v3-hot-WD9phN/report.json`
- Relevant checks: `managed Codex launch prompt is marker-tagged`; `Codex UserPromptSubmit launch packet is ignored by hook`; `normal Codex UserPromptSubmit hook still writes prose`.

### BUG-3A — RESOLVED

Finding: renderer could show an empty/stale feed after path switch.

Implementation/proof:
- The renderer already included path-scoped event fetches and revision guards in `App.tsx`.
- Strengthened `tests/app-path-scope.test.tsx` with the exact dangerous case: same `session_id` exists in two different active paths, and switching paths must refetch events even though `currentSessionId` is unchanged.
- Hot runner drives the production renderer in headless Chrome: it shows a boot-path event, creates the same-id session in a second path, writes a second-path event before switching, activates the second path, and waits for the production UI to show the second-path marker.

Hot evidence:
- Latest report: `/tmp/fmark-manual-v3-hot-WD9phN/report.json`
- Relevant check: `production renderer refetches events on path switch`.

### Additional discrepancy fixed during validation

Full renderer validation surfaced a separate intermittent blank embedded-flow fallback: `ProseInlineBlock` lazy-loaded `FlowCard` with an empty `.flow-card-embedded` fallback, so under full-suite load the flow title could miss the test window and users could briefly see a blank embedded block.

Fix:
- `packages/renderer/src/cards/ProseInlineBlock.tsx` now renders a fallback title and canvas shell while the real `FlowCard` chunk loads.

Verification:
- Focused: `pnpm -F @f-mark/renderer exec vitest run tests/cards/proseInlineBlock.test.tsx tests/app-path-scope.test.tsx` — PASS.
- Full renderer: `pnpm -F @f-mark/renderer test` — 53 files, 550 tests PASS.

### Final verification commands from this pass

- `pnpm -F f-mark exec vitest run tests/hooks/autoStream.test.ts tests/routes/managedAgents.test.ts tests/routes/sessions.test.ts tests/routes/paths.test.ts` — 63 tests PASS.
- `pnpm -F @f-mark/renderer exec vitest run tests/app-path-scope.test.tsx` — 2 tests PASS.
- `pnpm build` — PASS.
- `FMARK_HOT=1 node packages/kernel/tests/hot/manual-v3-regressions-hot.mjs` — 8 hot checks PASS, report `/tmp/fmark-manual-v3-hot-WD9phN/report.json`.
- `pnpm -F f-mark test` — 89 files, 604 tests PASS.
- `pnpm -F @f-mark/renderer test` — 53 files, 550 tests PASS.
- `FMARK_HOT=1 node packages/kernel/tests/hot/phase23-full-vendor-e2e-hot.mjs` — aggregate vendor matrix PASS on current artifacts, report `/tmp/fmark-mcp-phase23-hot-0KclB7/report.json`.

Phase 24 aggregate rerun exposed two stale hot-harness assumptions, both fixed and re-run:
- `phase13-agent-controls-hot.mjs` now records native launch-prompt argv before appending stdin control commands and asserts the launch marker; direct PASS `/tmp/fmark-mcp-phase13-hot-Rv5VyG/report.json`.
- `phase16-access-requests-hot.mjs` now writes versioned managed-only hook fixture commands; direct PASS `/tmp/fmark-mcp-phase16-hot-T4bgvZ/report.json`.

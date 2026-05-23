# Manual smoke — v0.4 tmux agent orchestration

For each runtime (Claude Code, Codex, Gemini CLI), perform on a real dev machine with tmux >= 3.0:

## Claude Code
- [ ] `npx f-mark` in a test project; open the UI; create a session.
- [ ] Top bar shows the env-probe banner if tmux/claude missing — install if needed.
- [ ] Click `+` → Claude. Pane spawns; tmux session created (`tmux ls` should show `fmark-...-ag-...`).
- [ ] If hooks missing: Hook Install Modal appears with the snippet for `~/.claude/settings.json` + the right agent + user participant ids. Paste it.
- [ ] Open the terminal overlay for the new agent chip. Send a message via the agent menu's "Send a message…" — confirm Claude receives it and responds.
- [ ] Once Claude responds, presence dot flips green within ~15s.
- [ ] Try `/compact` from the menu (best effort). Confirm it sends.
- [ ] Try interrupt. Confirm Ctrl-C arrives.
- [ ] Kill the agent via "Say goodbye" (with confirmation). Pane is destroyed.
- [ ] Restart the kernel (`Ctrl+C` then `npx f-mark` again); confirm the previous session is gone (because we killed it).
- [ ] Spawn another agent; this time `kill -9` the F-Mark kernel process (without "Say goodbye"). Tmux session should survive (`tmux ls`). Restart F-Mark; the agent should appear as `stale` then flip to `online` when the next hook ping arrives, OR stay `pane-dead` if the agent itself exited.

## Codex
- [ ] Same flow with `+` → Codex. Hook Install Modal shows `~/.codex/config.toml` snippet.
- [ ] First Codex run prompts the user to trust the hook command. Approve.
- [ ] Same lifecycle checks as Claude.
- [ ] **Known limitation:** Codex transcript parsing is preview-mode in v0.3.0; agent activity may appear partially. Confirm presence works regardless.

## Gemini CLI
- [ ] `+` → Gemini. Hook Install Modal shows "manual-stream mode — no hooks needed."
- [ ] In the spawned pane, run Gemini and have it perform a small task. It should manually POST prose + tool-use + turn-end via the existing v0.3.0 manual flow.
- [ ] Presence transitions: starts `stale` → flips `online` when first event arrives.

## Terminal
- [ ] `+` → Terminal. Plain shell spawns in the project dir.
- [ ] Manually launch `claude` inside this terminal. Hook ping fires; new agent participant appears in the chip row alongside the terminal.
- [ ] Verify the terminal pane and the agent are separately listed.
- [ ] Verify killing the terminal also ends the spawned-in agent (or shows it as `pane-dead`).

## Pane WS fan-out
- [ ] Open the terminal overlay for one agent. Open it AGAIN in a different browser tab/window pointed at the same kernel. Both windows see live output. Type in one; the other sees the keystrokes.
- [ ] Close one window. The other continues working.

## Reconcile
- [ ] Spawn 2 managed agents + 1 terminal.
- [ ] `kill -9` the kernel process.
- [ ] Confirm the 3 tmux sessions are still running (`tmux ls`).
- [ ] Restart F-Mark. The chip row reappears with the 3 entries.
- [ ] Confirm `@fmark-project` is verified (tmux session list shows the user options).

## Security
- [ ] Start kernel with `--no-auth` (no `--allow-process-api-no-auth`). Verify `POST /managed-agents/spawn` returns 404 with the documented error.
- [ ] Start kernel with `--no-auth --allow-process-api-no-auth`. Verify spawn works. Verify the banner warns about this dangerous combo.
- [ ] In default (token) mode, verify cookie-authed POST to `/managed-agents/terminal` from a non-localhost Origin returns 403.

Record any failures in `planning/v0.4-smoke-findings.md` and address before declaring v0.4 done.

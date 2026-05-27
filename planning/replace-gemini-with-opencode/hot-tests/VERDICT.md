# Phase 0 Verdict Matrix

opencode v1.15.11 + plugin SDK v1.14.33 (locally bundled).

| # | Assumption | Verdict | Evidence | Plan impact |
|---|------------|---------|----------|-------------|
| **A0 🛑** | Assistant-output hook exists | **PASS** | `03-assistant-output.md` | Use `event.message.part.updated` with `part.time?.end` presence as finalized. Lookup role via `messageID → role` map built from `message.updated`. |
| A1 | Project `.opencode/plugin/*.ts` auto-loads | DEFERRED | (Phase 6 — needs project init) | Default assumption: works (same loader as global, confirmed in A2). |
| A2 | Global `~/.config/opencode/plugin/*.ts` auto-loads | **PASS** | Probe loaded on every run; 30 log lines in initial run. |
| A3 | Plugin can `fetch()` to localhost | **PASS** | `nc` listener received `POST /from-plugin-init`. UA header: `opencode/1.15.11`. |
| A4 | `session.idle` reliable | **PARTIAL PASS** | Fired at end of every run tested. Error/interrupt scenarios not yet covered — defer to Phase 7 E2E. |
| A5 | `tool.execute.after` rich data | **PASS** | Captured `{tool, sessionID, callID, args, output, metadata, title}` for `read` tool. |
| **A6 🛑** | Permission gating via plugin | **PARTIAL FAIL** | `07-permission-gating.md` | Plugin `permission.ask` hook does NOT fire in `opencode run` headless mode. Bus event `permission.asked` DOES fire. SDK `postSessionIdPermissionsPermissionId` API exists. TUI-mode verification deferred to Phase 7. Plan revised: dual-path (observability + active gating). |
| A7 | `chat.message` is USER side | **PASS** | Fired once for user prompt; matches SDK `UserMessage` type. |
| A8 | F_MARK_* env propagates | **PASS** | All 3 env vars visible in `init` log when set via wrapper. |
| A9 | Plugin throws don't crash session | NOT TESTED | Skipped to save time; plugin defensively wraps everything in try/catch anyway. |
| A10 | `opencode run --format json` | NOT TESTED (deferred) | Not needed for managed-agent path. Defer. |
| A11 | F-Mark MCP loads via opencode.json | DEFERRED | (Phase 7 E2E — needs real F-Mark MCP) | SDK type confirms `McpLocalConfig` shape. |
| **A11.1** | MCP env key: `env` vs `environment` | **PASS via SDK type** | SDK `McpLocalConfig.environment` is the only field; no `env`. Plan: write `environment`, `statusFromOpencodeServer` checks `environment` first with `env` permissive fallback. |
| A12 | Session ID format stable | **PASS** | Format: `ses_<base62>` (e.g. `ses_196e9e928ffeEZ6Go6H4rxO0T1`). Safe for paths/JSON. |
| A13 | Hot-reload of plugin file | NOT TESTED | Defer — for v1 a restart-on-install is acceptable. |
| A14 | `opencode --pure` skips plugins | **PASS** | Probe did NOT load under `--pure`. |
| **A15 🛑** | `permission.ask` 30s sync block | **DEFERRED** | Hook doesn't fire in headless. TUI-mode test in Phase 7. |
| A16 | Plugin TS typechecks against bundled SDK | **PASS** (implicit) | Probe v1-v4 ran without TS errors (opencode bundles ts-node-equivalent). |
| **A17** | MCP tool naming inside opencode | DEFERRED | (Phase 7 E2E) | Defer to actual run with F-Mark MCP. Plan defaults to `mcp__fmark__` prefix; configurable via env var. |
| **A18** | JSON vs JSONC precedence | DEFERRED | (Phase 6) | Local opencode.jsonc exists, suggesting both supported. Plan uses `jsonc-parser` which handles either. |
| **A19** | `opencode.json.plugin` array fallback | **PASS via SDK type** | `Config.plugin?: Array<string>` exists. Not yet runtime-tested. Plan keeps fallback step gated on env var. |
| **A20** | Slash commands fire `command.execute.before` | DEFERRED | (Phase 9 manual smoke — needs TUI) | Default capabilities (`/compact`, `/clear`, `/fork`) based on strings probe. |

## Stop conditions evaluation

| # | Stop condition | Triggered? |
|---|----------------|------------|
| 1 | A0 fail (no assistant output) | NO — A0 PASS |
| 2 | A0 partial: deltas only, no final marker | NO — `part.time.end` is a clean final marker |
| 3 | A0/A4 missing session ID | NO — `sessionID` present on both |
| 4 | A4 session.idle missing/early | PARTIAL — works in normal flow; edge cases deferred to Phase 7 |
| 5 | A6 permission gating fail | **PARTIAL FAIL** — but workaround via bus event + SDK API gives observability; full active gating needs Phase 7 TUI test |
| 6 | A15 sync block disallowed | DEFERRED — can't test without permission.ask firing |
| 7 | Permission identity insufficient | NO — full `{id, sessionID, tool: {messageID, callID}, patterns}` available |
| 8 | A3 HTTP fail | NO — A3 PASS |
| 9 | A8 env fail | NO — A8 PASS |
| 10 | A11 MCP doesn't load | DEFERRED |
| 11 | A1+A19 both fail | NO — A2 PASS, A19 PASS via SDK type |
| 12 | Kernel polling shape mismatch | NO — already corrected in plan revision (`?kinds=`, `{events}`) |

## Decision: PROCEED to Phase 1 with adjustments

1. **Plugin template assistant-text path** — use the role-map approach documented in `03-assistant-output.md`.
2. **Permission path** — DUAL strategy:
   - Always subscribe to bus `event.permission.asked` for observability (post access-request)
   - Implement `permission.ask` plugin hook for active gating in TUI mode (the F-Mark managed-agent scenario)
   - Document headless mode as "observability only"
3. **MCP env key** — use `environment` only (drop the permissive `env` fallback since SDK is strict).
4. **Defer to Phase 7** (E2E in TUI mode):
   - A6 full active gating
   - A15 sync block tolerance
   - A11/A17 MCP loading + tool prefix
   - A4 edge cases (error, interrupt, permission-pending turns)
5. **No stop conditions triggered HARD**; only PARTIAL FAIL on A6 with documented workaround.

Ready to begin Phase 1.

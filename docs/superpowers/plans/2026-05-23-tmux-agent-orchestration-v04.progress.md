# v0.4 Tmux Agent Orchestration — Progress Log

## Phase 1 — Regression tripwire baseline (2026-05-23)

- Kernel tests: ✓ 188 passing across 39 files
- Renderer tests: ✓ 300 passing across 31 files
- Full build (`pnpm -r build`): ✓ clean
- Baseline commit: `afb7152` (plan committed; tip of `main`)

**Note for subagents:** kernel package name is `f-mark`, NOT `@f-mark/kernel`. The plan's `pnpm --filter @f-mark/kernel test` invocations must be substituted with `pnpm --filter f-mark test`. Plan amended in a follow-up commit.

## Per-phase status

| Phase | Status | Buddy review | Notes |
|---|---|---|---|
| 1 — Baseline | ✓ done | n/a | 188+300 tests green |
| 2 — Tmux Manager | pending | — | |
| 3 — Runtime Registry | pending | — | |
| 4 — Presence + ping | pending | — | |
| 5 — autoStream → ping | pending | — | |
| 6 — Managed-agent routes + auth gate | pending | — | |
| 7 — Pane WS | pending | — | |
| 8 — /command via input queue | pending | — | |
| 9 — Reconcile | pending | — | |
| 10 — Env probe + guide | pending | — | |
| 11 — Hook install status | pending | — | |
| 12 — Renderer UI | pending | — | |
| 13 — Settings panels | pending | — | |
| 14 — Tmux smoke | pending | — | |
| 15 — Docs + skill bundles | pending | — | |
| 16 — Manual smoke + 0.4.0 release | pending | — | |

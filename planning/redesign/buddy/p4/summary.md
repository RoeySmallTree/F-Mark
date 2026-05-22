# P4 — Layout shell (TopBar / Rails / Panels / Feed / RightPanel / Compose wrapper)

## Intent

Replace the placeholder App.tsx shell with the design's full 5-column shell: brand+breadcrumb topbar, view-toggle + turn-pill + participants + icon-buttons; left rail toggling between Sessions/Named/Todos/Comments/Search panels; right panel with Todos/Comments/Named/Log tabs scoped to the current session; a feed area whose cards remain placeholders (P5 will fill them); a compose wrapper that keeps the existing Composer functional until P6 rewrites it.

No card components, no compose internals, no modals or palettes — those are later phases.

## Commit

`f0e045d feat(renderer): redesign layout shell — topbar, rails, panels, right tabs`

## Files created

- `packages/renderer/src/shell/shell.css` — port of `planning/redesign/design.html` shell rules
- `packages/renderer/src/shell/TopBar.tsx`
- `packages/renderer/src/shell/LeftRail.tsx`
- `packages/renderer/src/shell/LeftPanel.tsx`
- `packages/renderer/src/shell/RightPanel.tsx`
- `packages/renderer/src/shell/Feed.tsx`
- `packages/renderer/src/shell/Compose.tsx`
- `packages/renderer/src/panels/{Sessions,Named,Todos,Comments,Search}.tsx`
- `packages/renderer/src/panels/right/{RightTodos,RightComments,RightNamed,RightLog}.tsx`
- `packages/renderer/tests/shell.test.tsx`

## Files modified

- `packages/renderer/src/App.tsx` — full rewrite to new shell tree
- `packages/renderer/src/state/store.ts` — adds `leftRail` / `rightTab` / `viewMode` + setters
- `packages/renderer/src/api/client.ts` — adds `listTodos` and `search` helpers
- `packages/renderer/src/styles.css` — `@import "./shell/shell.css"`
- `packages/renderer/package.json` — `@testing-library/user-event@^14`
- `pnpm-lock.yaml`
- `planning/redesign/progress.md`

## Verification done by implementer

- `pnpm -F @f-mark/renderer test` → 41 passing across 7 files (35 P3 baseline + 6 new shell tests).
- `pnpm -F @f-mark/renderer build` clean.

## What you (Codex) verify

Read `git show f0e045d --stat` then the actual code. Answer each item PASS / FAIL + one short reason.

1. **`shell.css` parity & themed colors:** the shell rules from `planning/redesign/design.html` lines ~186–305 (`.app`, `.main`, `.feed-col`, `.feed-scroll`, `.feed-inner`, `.topbar`, `.brand`, `.breadcrumb`, `.topbar-center`, `.turn-pill`, `.participants`, `.avatar`, `.topbar-right`, `.view-toggle`, `.icon-btn`, `.left-rail`, `.right-rail`, `.rail-btn`, `.left-panel`, `.panel-head`, `.new-btn`, `.panel-search`, `.panel-list`, `.group-label`, `.session-item`, `.right-panel`, `.right-tabs`, `.compose` etc.) are present, with every color expression resolved through `var(--…)`. Grep `shell.css` for `#[0-9a-fA-F]{3,6}` and `rgb\(` — call out any remaining literal except `transparent`.
2. **App.tsx tree matches the spec:** wrapper `<div class="app">`, then `<TopBar/>`, then `<div class="main">` containing `<LeftRail/><LeftPanel/><Feed/><RightPanel/>`, then `<div class="compose"><Compose/></div>`. Bootstrap effects (token-from-query, listSessions, listParticipants, WS subscribe) preserved.
3. **LeftRail behavior:** five buttons (Sessions, Named, Todos, Comments, Search) — clicking each updates `store.leftRail`. Active button gets the `::before` indicator (visual; confirmed via class on `<button class="rail-btn active">`).
4. **LeftPanel routing:** when `store.leftRail === 'sessions'` mounts Sessions panel; `=== 'named'` Named; etc. Test verifies each by header text.
5. **Right panel:** four tabs Todos / Comments / Named / Log with counts; scope subhead `in <slug>`; clicking switches `store.rightTab`; routes to the matching `panels/right/*`.
6. **Sessions panel realness:** `Sessions.tsx` calls `client.listSessions()` on mount and re-runs on WS `event_added` notifications. Grouped by recency (Today / Yesterday / Earlier this week / This month / Older). Clicking switches `store.currentSessionId`. + New button visible but `disabled` with a `title` pointing at P10.
7. **Other left panels are realness-not-mocks:**
   - Named uses `aggregate(events).named`.
   - Todos calls `GET /sessions/:id/todos`; gracefully empty when kernel is older.
   - Comments derives from `aggregate.commentsByTarget`.
   - Search is functional: debounced input → `GET /search?q=&session=`.
8. **Feed shell renders + emits `data-event-filename` for RightNamed scroll-into-view target.** The P4 placeholder paragraph exists for empty event lists.
9. **Compose wrapper:** the existing message-submit (legacy `components/Composer.tsx`) keeps working — `<Compose/>` mounts it inside the `.compose` wrapper.
10. **Store extensions present:** `leftRail`, `rightTab`, `viewMode` plus `setLeftRail`, `setRightTab`, `setViewMode`.
11. **Tests:** `tests/shell.test.tsx` covers the four spec items (TopBar render, LeftRail clicks → store, LeftPanel header per key, RightPanel tabs → store). All renderer tests still pass.
12. **Scope adherence:** no kernel files touched; no card components; no compose internals rewrite; no modals or palettes.

End with: `Overall verdict: ready to advance` OR `Overall verdict: fix the following before advancing: …`

Write the review to `/home/roey/workspace/F-Mark/planning/redesign/buddy/p4/review_1.md`. Do not modify any source files.

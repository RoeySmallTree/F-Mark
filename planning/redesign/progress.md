# F-Mark Redesign — Progress Log

> Append-only. Latest entry on top. Every subagent + every /buddy iteration adds a row.
> When all phases land: prepend `# REDESIGN COMPLETE` plus a one-paragraph summary.

| When | Phase | Actor | Action | Result |
|---|---|---|---|---|
| _start_ | — | orchestrator | Plan written, agents queued | Phases P1–P15 pending |
| 2026-05-22T21:07Z | P1 | implementer | landed theme tokens + switcher | tests 12 passing, build clean |
| 2026-05-22T21:17Z | P3 | implementer | landed markdown + json renderers | tests 35 passing |
| 2026-05-22T21:19Z | P2 | implementer | backend: todos / files / html / raw / presets / skills / search routes + scanner + shared types | kernel tests 28 files / 120 passing, build + bundle clean |
| 2026-05-22T21:30Z | P4 | implementer | landed layout shell — topbar, rails, panels, right tabs | tests 41 passing, build clean |
| 2026-05-22T21:42Z | P5 | implementer | landed event cards | tests 62 passing |
| 2026-05-22T21:49Z | P6 | implementer | landed compose bar + hotkeys | tests 75 passing |
| 2026-05-22T22:02Z | P10 | implementer | landed modal framework + new-session modal (slug input, 4 templates with starter prose, agent invite + inline register, open-immediately + clipboard snippet); wired `+ New` in Sessions panel | tests 109 passing (14 new in tests/modals), build clean |
| 2026-05-22T22:03Z | P12 | implementer | landed reusable Popover framework + LogFilterPopover (Kinds / Participants / Date range / Named-only) + RightLog rewrite (active filter chips, smooth-scroll to feed card on row click); additive store fields `activePopover` + `openPopover` / `closePopover`; ported popover + seg-control CSS to `popovers/popovers.css`; pure `applyFilter` helper | tests 110 passing (12 in popovers, 9 in panels/right-log), build clean |
| 2026-05-22T22:04Z | P11 | implementer | landed settings modal — 5 sections (Profile / Agents / Appearance / Shortcuts / About); added kernel `PATCH /participants/:id` (+ 3 tests); extended client (`updateParticipant`, `health`); `themes/density.ts` mirror module with persisted body class; extended `modals.css` with settings + density rules; wired Settings into TopBar gear icon; ModalRoot additive case for `'settings'` | renderer 119 / kernel 123 passing (9 new settings tests), build clean |
| 2026-05-22T22:15Z | P14 | implementer | landed comment overlay — `overlays/CommentThreadOverlay.tsx` (root + replies, anchor-snippet, reply input wired to `postProse({in_reply_to})`, resolve wired to `postProse({supersedes,content:'_resolved_'})`, close button clears `commentTarget`), `overlays/overlays.css` ported from design.html lines 444-467, RightPanel routes to overlay when `commentTarget!==null`, ProseCard adds `.focused` class when targeted (P5 dim already in place), `isResolvedComment` helper surfaces resolved threads with `.resolved` class | tests 136 passing (17 new in tests/overlays), build clean |

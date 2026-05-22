# Phase 15 Buddy Review — review_1

## Verdict
minor. The source check and fresh build/pack check support the main Phase 15 claims: I found no inert visible `<button>`, the `useHotkeys` bindings are represented in the Settings shortcut registry, and the kernel package builds with bundled renderer/shared artifacts. Minor drift: right-side todo empty copy is bucket-level rather than the left-panel todo spec string, and README status says v0.2.0 while the npm package still packs as f-mark@0.1.0.

## Q1 — Every visible button works
No broken visible `<button>` found in `packages/renderer/src`. The former TopBar breadcrumb is non-interactive markup (`packages/renderer/src/shell/TopBar.tsx:67`), and the remaining TopBar buttons call `setViewMode` or `openModal` (`packages/renderer/src/shell/TopBar.tsx:79`, `packages/renderer/src/shell/TopBar.tsx:144`).

Specific checks passed: Prose quick-copy copies `payload.content` (`packages/renderer/src/cards/ProseCard.tsx:76`, `packages/renderer/src/cards/ProseCard.tsx:89`); Choices menu copies `payload.question` (`packages/renderer/src/cards/ChoicesCard.tsx:76`); Embed menu copies an absolute URL from `src` (`packages/renderer/src/cards/EmbedCard.tsx:67`). Todos `+ ADD` toggles the inline form, disables when there is no session/user, and submits through `client.postTodo` (`packages/renderer/src/panels/Todos.tsx:77`, `packages/renderer/src/panels/Todos.tsx:118`, `packages/renderer/src/panels/Todos.tsx:164`).

## Q2 — All hotkeys documented
`rg "useHotkeys"` finds two callsites: App binds `$mod+k` (`packages/renderer/src/App.tsx:33`), and Compose binds `$mod+/`, `$mod+n`, `$mod+p`, `$mod+shift+k`, `$mod+enter`, and `escape` (`packages/renderer/src/compose/Compose.tsx:121`). All are present in `SHORTCUTS` (`packages/renderer/src/modals/settings/shortcut-registry.ts:21`).

Escape modal close is not a `useHotkeys` callsite, but it is implemented by the modal window listener (`packages/renderer/src/modals/ModalRoot.tsx:24`) and covered by the registry entry (`packages/renderer/src/modals/settings/shortcut-registry.ts:26`). Settings renders shortcut chips via `chordToKeys` (`packages/renderer/src/modals/settings/Shortcuts.tsx:38`), which maps `$mod` to `Cmd` on Mac-like platforms and `Ctrl` otherwise (`packages/renderer/src/modals/settings/shortcut-registry.ts:41`).

## Q3 — Empty states correct
Exact headline strings are present: Sessions has `No sessions yet. Press + New.` (`packages/renderer/src/panels/Sessions.tsx:136`); left Todos has `No todos in <slug>. Click + Add.` (`packages/renderer/src/panels/Todos.tsx:196`); Search has `Type to search across sessions, named contributions, todos.` (`packages/renderer/src/panels/Search.tsx:138`); Settings Agents has `No agents registered yet. Click + Add agent above.` (`packages/renderer/src/modals/settings/Agents.tsx:140`).

Other checked empty states are present: Named (`packages/renderer/src/panels/Named.tsx:50`), Comments (`packages/renderer/src/panels/Comments.tsx:49`), right Named (`packages/renderer/src/panels/right/RightNamed.tsx:25`), right Comments (`packages/renderer/src/panels/right/RightComments.tsx:25`), right Log (`packages/renderer/src/panels/right/RightLog.tsx:229`), Feed per-view (`packages/renderer/src/shell/Feed.tsx:52`), CmdK (`packages/renderer/src/modals/CmdKModal.tsx:281`), and Skills (`packages/renderer/src/modals/SkillsPaletteModal.tsx:245`).

Minor drift: right-side Todos still emits per-bucket copy (`No open todos.`, `Nothing in progress.`, `Nothing done yet.`) at `packages/renderer/src/panels/right/RightTodos.tsx:96`, with the session scope rendered separately by `packages/renderer/src/shell/RightPanel.tsx:90`. It is not the same empty string as left Todos.

## Q4 — Build pipeline produces a deployable npm package
Fresh commands succeeded: `pnpm -F @f-mark/shared build`, `pnpm -F @f-mark/renderer build`, `pnpm -F f-mark build`, and `pnpm -F f-mark build:bundle`.

`packages/kernel/dist/renderer/index.html` references hashed renderer assets (`packages/kernel/dist/renderer/index.html:10`, `packages/kernel/dist/renderer/index.html:11`), and the files exist under `packages/kernel/dist/renderer/assets/`. Shared output exists under `packages/kernel/dist/_shared/`, and kernel imports are rewritten to `_shared` (`packages/kernel/dist/watcher.js:3`, `packages/kernel/dist/_shared/index.js:1`).

`pnpm -F f-mark pack --pack-destination /tmp` produced `/tmp/f-mark-0.1.0.tgz`; the tarball includes `package/dist/`, `package/bin/f-mark.js`, and `package/assets/`, matching the package `files` manifest (`packages/kernel/package.json:14`).

## Other observations
README status says v0.2.0, but the npm package version is still `0.1.0` (`README.md:61`, `packages/kernel/package.json:3`). Several inline shortcut hints outside Settings still hardcode `⌘` (`packages/renderer/src/shell/TopBar.tsx:147`, `packages/renderer/src/compose/ModeBar.tsx:18`, `packages/renderer/src/compose/Compose.tsx:256`); Settings itself is platform-aware.

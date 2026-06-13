# Within Files Spec Review

## Findings

### 1. Blocker - `/file-tree/:sessionId` cannot actually use `path_id` to disambiguate collisions

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:129-132`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:168-170`

The spec says the route is `/file-tree/:sessionId`, then says `path_id` disambiguates session-id collisions across roots. But the launch URL only carries `sessionId` and `token`, so the standalone page has no disambiguator to resolve an ambiguous `listAllSessions()` result. The source model already treats `path_id` as the root disambiguator (`packages/shared/src/sessions.ts:4-15`), and the all-sessions route returns it per session (`packages/kernel/src/routes/sessions.ts:145-153`).

Concrete fix: change the route/launch contract to include `path_id`, for example `/file-tree/:pathId/:sessionId` or `/file-tree/:sessionId?path_id=...&token=...`. The dropdown state should be keyed by `(path_id, sessionId)`, not session id alone. Validation should reject an ambiguous session id when no `path_id` is present.

### 2. Blocker - standalone file comments are promised, but event writes/wake still target the active root

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:153-166`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:239-247`

The spec allows posting file comments from `/file-tree` once phase 3 ships, but only extends the file read routes. Event POST routes still resolve `Paths` from the active root (`packages/kernel/src/routes/events.ts:142-152`), and the `path` body field is a stale-hook guard that rejects non-active paths unless `quietCrossPathHooks` is set (`packages/kernel/src/routes/stalePath.ts:27-72`). The list-events route can read a `path` query, but it currently trusts an arbitrary path and calls `makePaths(req.query.path)` directly (`packages/kernel/src/routes/events.ts:681-686`). `RightComments` refresh also calls `client.listEvents(currentSessionId, {})` with no path (`packages/renderer/src/panels/right/RightComments.tsx:591-595`), and wake uses the active route paths (`packages/kernel/src/routes/managedAgents.ts:1601-1604`).

Concrete fix: either cut standalone comment posting from v1, or add a root-scoped event contract alongside the file read fork. That means `client.listEvents`, `client.postProse`, and `wakeSession` need an optional validated `path_id`/root, event POST schemas need that field, handlers must resolve `makePaths(knownRoot)` instead of active `resolvePaths(deps)`, and `GET /sessions/:id/events?path=...` must be tightened to the same known-root guard instead of accepting arbitrary paths.

### 3. Blocker - Monaco DiffEditor has no defined way to get the base text

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:288-294`

The spec says Monaco DiffEditor gets base + working text through extended `/files/text?...&base=`, but phase 2 only extends `/files/text` for root/path selection, and phase 4 never defines a base-text endpoint. The current client supports only `path` and `maxBytes` (`packages/renderer/src/api/client.ts:404-407`), and the route reads the working-tree file from disk after the active-root guard (`packages/kernel/src/routes/filesText.ts:40-48`, `packages/kernel/src/routes/filesText.ts:76-86`). A `base` query cannot work without new server behavior that reads git blobs.

Concrete fix: define the API explicitly. Prefer a git-owned endpoint such as `GET /git/file-version?root=&path=&mode=&base=` returning `{ baseText, workingText, status }`, or make `/git/diff` include text payloads for Monaco-readable files. If `/files/text` is extended instead, specify exact query fields and implementation for `git show <merge-base>:<relPath>`, added/untracked/deleted files, truncation, and known-root validation.

### 4. Should-fix - the known-root source list is narrower than the prior decision

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:134-145`

The spec says the allowed roots are "the same set" as all-session listing, but then only names `state.knownPaths` plus active path and the project registry. The prior decision explicitly included active path, `knownPaths`, favorites, registered paths, and fallback (`planning/within-files/decisions.md:93-99`). The source does include favorites and fallback in all-session enumeration (`packages/kernel/src/routes/sessions.ts:120-134`).

Concrete fix: specify and implement one shared helper, for example `listKnownRoots(deps)`, used by `/sessions?scope=all`, `/files/tree`, `/files/text`, `/files/content`, `/git/*`, and any root-scoped event APIs. It must include active context root, `state.activePath`, `state.knownPaths`, `state.favorites[].path`, `listRegisteredProjectPaths(...)`, and `deps.fallback.root()`, canonicalized/deduped with path ids.

### 5. Should-fix - per-tab diff state is named but not keyed

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:288-290`

The spec says diff-mode state is stored "per tab in the store" but does not define the key or persistence behavior. Existing tabs are `{ path, pinned }` only (`packages/renderer/src/state/store.ts:76-79`), tab lists are keyed by session (`packages/renderer/src/state/store.ts:700-702`), and duplicate tabs for the same path are prevented (`packages/renderer/src/state/store.ts:1077-1084`). File switches remount renderers by active path (`packages/renderer/src/panels/fileViewer/FileViewer.tsx:45-82`).

Concrete fix: add an explicit store shape before implementation. For example: `fileViewerDiffBySession: Record<sessionId, Record<absPath, { mode: "none" | "current-session" | "whole-branch"; style: "inline" | "side-by-side" }>>`, with a standalone in-memory namespace for `/file-tree`. State whether this persists with tabs or resets on reload.

### 6. Should-fix - `file_path` is root-relative, but the renderer works in absolute paths

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:184-193`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:231-241`

The spec correctly preserves the prior decision that persisted file comments use project-root-relative `file_path` (`planning/within-files/decisions.md:49-54`), but it does not say where absolute viewer paths are converted. The file tree opens absolute paths (`packages/renderer/src/panels/right/files/FileRow.tsx:25-29`, `packages/renderer/src/panels/right/files/FileRow.tsx:56-70`), and file renderers receive absolute `path` props from `FileViewer` (`packages/renderer/src/panels/fileViewer/FileViewer.tsx:59-80`).

Concrete fix: add a small root-relative path helper to the renderer implementation plan, fed by `activePath` or the standalone selected root. It should canonicalize/normalize separators, reject paths outside the selected root, and be used by line comments, hunk comments, grouping/focus lookup, and file-comment card click handling. Add a backend validator too, so absolute `file_path` values do not silently enter the event log.

### 7. Should-fix - `commentTarget` discriminator changes more call sites than the spec lists

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:215-229`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:243-247`

The spec lists the store discriminator, `RightComments`, `EventCard`, and a new `FileCommentCard`, but existing renderer code dereferences `commentTarget.file` in several places. Examples: `ProseCard` focus logic (`packages/renderer/src/cards/ProseCard.tsx:65-68`), `FileCard` focus/open-comment logic (`packages/renderer/src/cards/FileCard.tsx:340-352`, `packages/renderer/src/cards/FileCard.tsx:469`), `RightComments` active key (`packages/renderer/src/panels/right/RightComments.tsx:374-379`), `LineCommentRail` highlighting (`packages/renderer/src/cards/LineCommentRail.tsx:373-383`), and feed dimming on any comment target (`packages/renderer/src/shell/Feed.tsx:468-469`).

Concrete fix: expand phase 3's renderer file-touch list to every `commentTarget` consumer. Event-comment code should narrow `kind === "event"` before using event filenames or feed anchors. File-comment code should narrow `kind === "file"` and must not run feed-anchor scroll/dim logic unless an actual feed event anchor exists.

### 8. Should-fix - phase 1 has an inconsistent layout DOM target

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:68-80`

The spec says `applyLayout(name)` sets `data-layout` on `.main` / body class, and also says to apply it in `main.tsx` before `createRoot`. Before first render, `.main` does not exist (`packages/renderer/src/main.tsx:13-20`; `.main` is created by `App` at `packages/renderer/src/App.tsx:533-537`). The CSS selector shown in the spec, `[data-layout="..."] .main`, implies an ancestor target, not `.main` itself.

Concrete fix: choose one target. For no-FOUC boot behavior, use `document.body.dataset.layout = name` or `document.documentElement.dataset.layout = name`, and write selectors as `body[data-layout="..."] .main` or `:root[data-layout="..."] .main`. If the target is `.main`, then `App` must read layout state and render `<div className="main" data-layout={layout}>`, but that cannot be the only pre-render application path.

### 9. Should-fix - extra-pane behavior is still hard-coded as right-of-chat

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:82-83`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:107-116`

The spec calls out an explicit `extra` grid area, but it does not include the extra-pane shell and CSS in the phase 1 changes. Those files currently assume the extra pane sits between chat and the right panel: the shell comment says so (`packages/renderer/src/panels/fileViewer/shells/ExtraPaneShell.tsx:9-11`), the resizer is always on the left and dragging left widens it (`packages/renderer/src/panels/fileViewer/shells/ExtraPaneShell.tsx:22-35`), and the collapsed reopen button is positioned with `right: var(--right-panel-w, 340px)` (`packages/renderer/src/panels/fileViewer/fileViewer.css:402-423`).

Concrete fix: include `ExtraPaneShell.tsx` and `fileViewer.css` in phase 1. The extra pane needs a derived physical edge, resizer sign, border side, and collapsed-button placement based on the active arrangement and whether `extra` lands left or right of the chat slot. The manual check for `has-extra-pane` under swapped layouts is otherwise not implementable.

### 10. Should-fix - untracked files are listed, but their diff/revert semantics are undefined

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:267-280`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:303-305`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:325-329`

The changed-files endpoint promises `untracked`, but the base-ref section describes `git merge-base <base> HEAD` and `diff merge-base→working-tree`. Plain git diff does not include untracked files. Phase 5 then says every hunk can be reverse-applied, but does not say whether untracked/added/deleted/renamed hunks expose revert actions or only comments/badges.

Concrete fix: specify that changed-files combines git diff output with `git ls-files --others --exclude-standard`. For untracked text files, either synthesize a new-file diff from `/dev/null` and define whether reverse apply deletes the file or removes selected hunks, or explicitly disable hunk revert for untracked files in v1. Do the same action-availability matrix for added, deleted, renamed, and binary files.

### 11. Nit - `diff_base` names do not match the diff-mode names

Spec location: `docs/superpowers/specs/2026-06-13-within-files-features-design.md:16-18`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:191-193`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:320-323`

The user-facing diff modes are `none`, `current-session`, and `whole-branch`, but `diff_base` is described as `"working" | "session" | "branch" | string`, and hunk comments store "the active mode". That leaves implementers to invent a mapping, which matters because `RightComments` grouping keys include `diff_base`.

Concrete fix: make the stored discriminator exact: either store the UI mode names (`"current-session"`, `"whole-branch"`, maybe `"none"` only for ordinary working-file comments) plus optional `base_ref`/merge-base sha, or define a separate normalized enum and require the UI to map to it everywhere.

## Fidelity Check

The spec is mostly faithful to the prior decisions on the big boundaries: `append_to` remains event-to-event, file comments are a prose role, git hunks are authoritative for actions, non-git diff modes are disabled, and layout scope is global. The meaningful fidelity misses are the incomplete known-root source list, the missing path disambiguator in the `/file-tree` URL, and the lack of a concrete root-scoped event/write path for standalone comments.

## Verdict

Not ready to turn directly into implementation plans. It is close conceptually, but the blockers above should be fixed in the spec first: add `path_id` to the standalone route contract, define shared known-root resolution, define root-scoped event/comment/wake APIs or cut standalone comments, and define the base-text API for Monaco diffs. After those changes, the phase plans can be split safely.

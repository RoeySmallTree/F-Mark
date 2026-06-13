# Design — "Within Files" feature set

**Date:** 2026-06-13
**Status:** Draft for review (merged with Codex consultation + spec review)
**Scope:** Four user-facing features that turn the F-Mark file viewer into an interactive,
diff-aware, commentable surface, plus a configurable app layout.

> This is one cohesive design covering four features. Each **phase** below is independently
> buildable and will get its own implementation plan (via `writing-plans`). The phase order is
> dependency- and risk-ordered, not the order the features were requested.

---

## 1. Goals

1. **Diff toggle in the file viewer** — `none` / `current-session` (default) / `whole-branch`,
   with inline and side-by-side styles; per-hunk **revert** and per-hunk **comment** (the comment
   appends the diff hunk + the user's text to the conversation).
2. **Line/diff comments in files** — hover/select lines to add a comment, reusing the existing
   chat document-comment mechanism. Posts a new prose role, enables conversations over
   lines/diffs/parts of files, and triggers the Comments tab.
3. **Open file tree in a new tab** — a `/file-tree/:sessionId` route showing the tree explorer +
   file viewer for a session, with a session dropdown to switch (defaults to the launching session).
4. **Configurable layout** — a settings picker to place the left pane, chat pane, and right pane in
   any horizontal arrangement, applied live, persisted to localStorage, defaulting to today's layout.

## 2. Non-goals / cut from v1

- No git snapshot/stash/worktree mutation at session creation. (Session diff is derived, not snapshotted.)
- No tool-use "replay" diff fallback for non-git projects — diff modes simply disable there.
- No vertical/stacked/free-2D pane layout — only the six horizontal permutations of the three regions.
- No diff body for binary/image/audio/video/office files — a "changed" badge only.
- **No comment *posting* from the `/file-tree` standalone tab in v1** — it is read-only (viewing + diff
  viewing). Posting comments to a non-active session needs a root-scoped event write/wake API (see §5.4 /
  §11); deferred.
- No persisted standalone-tab state (favorites, last-focused-session, file-tab persistence) from `/file-tree`.
- No settings UI for branch-base override in v1 — an API/config escape hatch only.
- No Monaco-computed hunks as the source of truth for revert/comment — git hunks are authoritative.
- No cross-tab state synchronization beyond *avoiding* shared-key clobbering.
- No automatic line-drift repair — store the hunk snippet for stable context; current-line reveal is best-effort.

## 3. Architecture principles (ownership boundaries that must not blur)

- **P1 — `append_to` stays an event→event relationship.** File/diff comments use a *separate* file-target
  prose contract (`file_path` + `lines` + optional `diff_hunk` + `diff_base`). Do not overload the existing
  `commentTarget`/`append_to` shape (an event filename used as a DOM selector; validator `EVENT_FILENAME_RE`
  in `proseValidate.ts`).
- **P2 — git is authoritative for diff bytes & hunk actions; known-root/session state is authoritative for
  which files are readable.** Monaco DiffEditor is a *reading* convenience only; revert/comment attach to
  server-produced git hunk IDs.
- **P3 — the standalone `/file-tree` surface is read-mostly and state-isolated.** It must not write the
  shared localStorage keys the main app reads on boot, and (v1) does not write events at all.

## 4. Shared primitive — `listKnownRoots(deps)` (used by phases 2 & 4)

A single shared kernel helper that enumerates the **allowed project roots**, canonicalized + deduped, each
with its `path_id` (`computePathId`). Sources (the same set all-session listing already unions —
`packages/kernel/src/routes/sessions.ts:120-153`):

- the active context root and `state.activePath`,
- `state.knownPaths` (`packages/kernel/src/state/store.ts`),
- `state.favorites[].path`,
- registered project paths (`packages/kernel/src/paths/registry.ts`),
- `deps.fallback.root()`.

Used by `/sessions?scope=all`, `/files/tree`, `/files/text`, `/files/content`, and `/git/*`. A
parameterized `projectRootGuard(root, canonical)` replaces today's hard-coded `paths.root()` check, and an
`isKnownRoot(root)` predicate gates any client-supplied root. **This is the only mechanism by which a
non-active root becomes readable** — arbitrary client paths are never trusted.

---

## 5. Phase 1 — Configurable layout (feature 4)

Independent, renderer-only (plus a localStorage helper). Lowest risk; ships first.

### 5.1 Model & persistence
- New module `packages/renderer/src/themes/layout.ts`, mirroring `themes/density.ts` 1:1:
  - `export type LayoutName` — the six horizontal permutations of the movable regions
    `{ leftPanel, chat, rightPanel }`. Default `"classic"` = `leftPanel | chat | rightPanel` (today).
  - `STORAGE_KEY = "fmark.layout"`, `LAYOUTS: { name, label, description, slots:[a,b,c] }[]` (drives the
    picker), `isLayoutName` guard, `getCurrentLayout()` (validated default), `applyLayout(name)`,
    `subscribeLayout(cb)`.
- **DOM target (fixes the pre-render `.main`-doesn't-exist problem):** `applyLayout` sets
  `document.body.dataset.layout = name` (body, not `.main`, which `App` only creates at render —
  `packages/renderer/src/App.tsx:533-537`). CSS selectors are `body[data-layout="…"] .main { … }`.
- Apply at boot in `packages/renderer/src/main.tsx` next to `applyTheme`/`applyDensity` (before
  `createRoot`, no FOUC). The picker re-renders via `subscribeLayout`.
- **Scope: global** (like theme/density), not per-session/per-project. Pane *widths* remain per-session.

### 5.2 Shell CSS
- Convert `.main` (`packages/renderer/src/shell/shell.css:11-25`) from positional
  `grid-template-columns: auto auto 1fr auto` to **named `grid-template-areas`**. Assign `grid-area` to
  `.left-rail` (always pinned far-left), `.left-panel-host`, `.feed-col`, `.right-panel`, and an explicit
  `extra` area (see §5.6).
- Per-layout overrides keyed by `body[data-layout="…"] .main`. The `1fr` track always belongs to whichever
  slot holds **chat** (`.feed-col`).

### 5.3 LeftRail
- The 48px `LeftRail` icon nav **stays pinned to the physical left edge** in all layouts (primary app nav,
  not a content pane — `App.tsx:538-539`). The picker labels "Left pane" = the session/path **LeftPanel**,
  explicitly not the rail.

### 5.4 PaneResizer (layout-aware)
- `PaneResizer.tsx` today hard-codes `side` → which width-map it mutates and the drag sign
  (`side="right"` grows LeftPanel; `side="left"` grows RightPanel — `:23-29`, `:50-59`).
- New contract: **width maps stay keyed by pane identity** (`leftPanelWidthBySession` is always the
  LeftPanel, regardless of which edge it sits on); only the handle **edge** and **drag-sign** are derived
  from the pane's current slot in the active layout.

### 5.5 Picker UI
- Add a row to `packages/renderer/src/modals/settings/Appearance.tsx` (already subscribes to theme +
  density). Add `getCurrentLayout()` state + `subscribeLayout` in the same effect; `pickLayout()` calls
  `applyLayout`.
- Render an **interactive orientation picker**: clickable diagrams (reuse `.theme-grid`/`theme-card`), each
  a box mock of the three slots. Click-to-select preset diagrams satisfy "interactive orientation picker"
  for v1 (drag-to-assign is a later nice-to-have).
- Name it "Pane arrangement" to disambiguate from the existing right-pane **"Layout" tab**
  (`RightLayout.tsx`, which configures right-pane *tab* order/visibility).

### 5.6 Extra-pane + file-viewer reveal modes (must be in phase 1 — they encode physical right-of-chat)
- `ExtraPaneShell.tsx` and `fileViewer.css` currently assume the extra pane sits between chat and the right
  panel: resizer always on the left growing leftward (`ExtraPaneShell.tsx:22-35`), collapsed reopen button
  positioned `right: var(--right-panel-w, 340px)` (`fileViewer.css:402-423`). **Include both files in
  phase 1.**
- When `.main.has-extra-pane` is active, the `extra` grid area is placed adjacent to the chat slot; the
  extra pane derives its physical edge, resizer sign, border side, and collapsed-button placement from the
  active arrangement (whether `extra` lands left or right of chat).
- Precedence: placement governs the three base regions. `replace-chat`/`lower` operate *inside* the chat
  slot; `modal` floats above placement; `extra` uses the explicit `extra` area. `/file-tree` (phase 2) uses
  its own standalone layout and ignores base placement.

### 5.7 Testing
- Unit: `isLayoutName`/`getCurrentLayout` defaults (mirror density helper style).
- Manual/browser: switch each arrangement live; widths persist per-identity; resizer handle follows the
  pane and drags correctly; `has-extra-pane` **and** `replace-chat` render correctly under a swapped layout.

---

## 6. Phase 2 — `/file-tree/:sessionId` standalone tab (feature 3)

### 6.1 Routing (no router library)
- `/file-tree/...` already serves the SPA via the static catch-all (`routes/static.ts` notFoundHandler).
  **No server route needed for the page.**
- In `main.tsx` (or top of `App.tsx`), branch on `window.location.pathname.startsWith("/file-tree")` →
  render a lightweight `<FileTreePage/>` instead of `<App/>`.
- **Route/launch contract (fixes the path_id disambiguation blocker):**
  `/file-tree/:sessionId?path_id=<id>&token=<tok>`. Session ids can collide across roots, so `path_id` is a
  required disambiguator carried on the launch URL. The launcher (`window.open`) always includes it.
- On load, resolve `(path_id, sessionId)` against `listAllSessions()` → the session's `path`
  (`SessionWithPath`, `packages/shared/src/sessions.ts:4-15`). Reject an ambiguous `sessionId` when
  `path_id` is absent; show a local not-found state if unresolved. Dropdown state is keyed by
  `(path_id, sessionId)`, not session id alone.

### 6.2 Backend — the read fork (decision C1 = option b)
- **Extend `/files/text` and `/files/content` to accept an optional `root` (or `path_id`)**, validated via
  the shared `isKnownRoot` / `listKnownRoots` helper (§4) and a parameterized `projectRootGuard(root, …)`.
  When absent, behavior is unchanged (active root) — backward compatible.
- `/files/tree` already accepts an arbitrary `root`; tighten it to validate against known roots too.
- **Do not** flip the server's global active path from the dropdown (that broadcasts `path-switched` and
  yanks every other open tab).

### 6.3 Frontend — `<FileTreePage/>`
- Compose `RightFiles` (tree) + `FileViewer` (viewer) in a fixed standalone layout (tree left, viewer
  right). Reuse `PathSwitcher.tsx`'s open/outside-click/Escape for the **session dropdown** (populated from
  `listAllSessions()`), shown above the panes.
- **State isolation (P3):** an explicit "standalone mode" flag, *not* the full `App` boot path. Seed minimal
  store state from the URL (token, resolved path/path_id, session id). Suppress shared-localStorage side
  effects — no `setCurrentSession` last-focused persistence; file tabs ephemeral/in-memory or route-namespaced.
- The dropdown re-scopes *this tab only* (sets local path/session + refetches tree/content via the
  per-request `root`), never the server active path.
- `client.fetchFileText` / `fileContentUrl` / `fetchFilesTree` gain an optional `root`/`path_id` arg
  threaded to the extended endpoints.

### 6.4 Scope of the standalone page (v1)
- File browsing + viewing + diff viewing (once phase 4 ships) with **ephemeral tabs**. **Read-only:** no
  shared favorites / last-focused / file-tab persistence writes, **and no comment posting** (see §2; blocked
  on a root-scoped event write/wake API — §11). Comment *threads* may still render read-only if their
  session is the one being viewed.

### 6.5 Launching
- A control in the file-viewer chrome / TopBar calls
  `window.open('/file-tree/' + sessionId + '?path_id=' + pathId + '&token=' + token, '_blank')`.

### 6.6 Testing
- Unit: `isKnownRoot`/`listKnownRoots` (accept known roots incl. nested files; reject unknown/escape paths).
- Unit: `(path_id, sessionId)` resolution incl. cross-root collision + ambiguous/not-found.
- Manual/browser: open tab, switch sessions via dropdown, read files from a non-active session's root,
  confirm the main app tab is undisturbed (no path-switch, no localStorage bleed).

---

## 7. Phase 3 — File/line comments (feature 2)

Prerequisite for feature 1's "comment on a hunk."

### 7.1 Data model — new prose role `file-comment`
A new prose **sub-role** (not a new `EventKind`), classified from new frontmatter fields on
`ProseFrontmatter` / `ProsePayload` / `PostProseBody`:
- `file_path: string` — **project-root-relative** (survives moves; resolved against the selected session
  root). Absolute paths are rejected by a backend validator (see §7.4).
- `lines?: [number, number]` — **advisory** (may drift); reuse the existing field.
- `diff_hunk?: string` — the unified-diff hunk text (stable display context; supplied by feature 1).
- `diff_base?: DiffBase` — **exact, matching the UI diff modes** to avoid an invented mapping:
  `"working" | "current-session" | "whole-branch" | string` where the string form is a merge-base/commit
  sha. `"working"` = an ordinary working-file line comment not tied to a diff mode;
  `"current-session"`/`"whole-branch"` = a hunk comment made in that mode. Optionally store a resolved
  `base_ref` sha alongside for reproducibility. The grouping key (§7.3) uses this exact value.

### 7.2 The full allowlist chain (all change together, or comments fail silently/hard)
- `packages/shared/src/events.ts` — add the fields to `ProseFrontmatter`/`ProsePayload`.
- `packages/shared/src/eventContracts.ts` — add them to `PostProseBody`.
- `packages/shared/src/proseRoles.ts` — add a `file-comment` variant to `ProseRole`; in `getProseRole()`,
  return it when `file_path` is set, **with precedence before the `append_to` branches**.
- `packages/shared/src/blocks.ts` — add `getFileCommentTarget(payload)` (parallel to `getCommentTarget`).
- `packages/kernel/src/events/prose.ts` — emit the fields in `pickFrontmatter`; read them in `parseProse`
  (both are explicit allowlists).
- `packages/kernel/src/events/proseValidate.ts` — add a rule branch: `file_path` (non-empty) is a valid
  *self-contained* target; allow `lines` when `file_path` is set even without `mode`/`append_to`; **reject
  `file_path` together with `append_to`/`mode`**. Keep `EVENT_FILENAME_RE` for `append_to` only.
- `packages/kernel/src/services/events.ts` — copy the fields in `prosePayload()`; pass to the validator.
- `packages/kernel/src/routes/events.ts` — add the fields to the prose POST JSON schema
  (`additionalProperties:false`).
- `packages/kernel/src/mcp/tools.ts` — add the fields to `fmark_post_prose` (decision B6: agents can
  post/answer). **After** the parser/serializer/validator changes, never before.

### 7.3 Renderer
- `packages/renderer/src/state/aggregate.ts` — treat `file-comment` as comment-activity (appears in the
  feed, not flagged orphan); add a `fileCommentsByPath` bucket. Edit/resolve/delete/supersede are
  content-encoded conventions handled generically by filename — file comments inherit them as prose events.
- `packages/renderer/src/cards/EventCard.tsx` — dispatch `file-comment` → a new card.
- New `packages/renderer/src/cards/FileCommentCard.tsx` (dedicated, not extending `CommentActivityCard`):
  path, line/hunk label, hunk snippet. Click → open Comments tab + focus the file/line.
- `packages/renderer/src/panels/right/RightComments.tsx` — `buildCommentGroups` also buckets file comments;
  key = **`file_path::diff_base::hunk`** when hunk metadata exists, else `file_path::lines`. `postComment`
  can post the file-target shape.
- **`commentTarget` discriminator — touch *every* consumer (this is wider than just the store).** Change
  the store shape to `{ kind: "event"; file } | { kind: "file"; file_path; lines? }`
  (`store.ts` `commentTarget`), then update **all** dereferencers to narrow by `kind` and skip feed-anchor
  scroll/dim logic for `kind:"file"` unless a real feed anchor exists:
  - `cards/ProseCard.tsx:65-68` (focus), `cards/FileCard.tsx:340-352,469` (focus/open-comment),
    `panels/right/RightComments.tsx:374-379` (active key), `cards/LineCommentRail.tsx:373-383`
    (highlighting), `shell/Feed.tsx:468-469` (feed dimming).

### 7.4 Root-relative path conversion
- Add a renderer helper that converts the viewer's **absolute** path (the tree/viewer work in absolute
  paths — `FileRow.tsx:25-29,56-70`; `FileViewer.tsx:59-80`) to a **root-relative** `file_path`, fed by
  `activePath` (or the standalone selected root): canonicalize, normalize separators, reject paths outside
  the root. Used by line comments, hunk comments, grouping/focus lookup, and card click handling.
- Add a **backend validator** so absolute `file_path` values never enter the event log.

### 7.5 The line-comment affordance in the file viewer
- `LineCommentRail.tsx` (built around rendered-markdown line measurement) is the *mechanism template*, not
  directly reusable over Monaco.
- **Code (Monaco) files:** add a glyph-margin + decorations + `onDidChangeCursorSelection` affordance in
  `MonacoRenderer.tsx`. Hover/select line(s) → "add comment" → draft popover → post `file-comment` with
  `file_path` + `lines`. **Expose an imperative handle for `revealLine`** (the current wrapper doesn't —
  needed for §7.6 reveal).
- **Rendered non-code (markdown/csv):** wrap the renderer body in a `LineCommentRail`-style overlay.
- Both set `commentTarget` (file-kind), call `setRightTab("comments")`, post via `client.postProse`, and
  wake mentioned/authoring agents (existing `wakeSession`).

### 7.6 Focus/scroll behavior
- Clicking a file comment opens the file in the viewer and reveals the target line/hunk (Monaco
  `revealLine` via the imperative handle; best-effort for non-code).
- In `/file-tree/:sessionId` there is **no feed anchor** — open/reveal in the local viewer and keep the
  thread in list mode; never scroll `.feed-scroll`.

### 7.7 Testing
- Unit: `getProseRole` classifies `file-comment`; validator accepts `file_path`+`lines`, rejects
  `file_path`+`append_to`; serialize/parse round-trips the new fields; root-relative conversion rejects
  out-of-root.
- Unit: `buildCommentGroups` keying (`file_path::diff_base::hunk` vs `file_path::lines`).
- Manual/browser: select lines in a code file → comment → FileCommentCard in feed + Comments tab; click →
  opens file + reveals line; agent replies via MCP.

---

## 8. Phase 4 — Read-only diff (feature 1, part 1)

### 8.1 Backend — `routes/git.ts` + a git service
- New `packages/kernel/src/git/*` shelling git via `node:child_process` (mirror the testable
  `tmux/commandRunner.ts` pattern; **no new dependency**). All paths go through `resolveBrowsePath` + the
  parameterized known-root guard (§4).
- New `packages/kernel/src/routes/git.ts` (registered in `server.ts`). **Add `/git` to the static fallback
  API-prefix allowlist** (`routes/static.ts:50-62`) so a missing endpoint returns JSON 404, not index.html.
- Endpoints (all accept a known `root` + optional `sessionId`):
  - `GET /git/changed-files?root=&base=&mode=branch|session` → changed files with status
    (added/modified/deleted/renamed/**untracked**) + per-file counts. **Untracked are NOT in `git diff`** —
    union `git diff` output with `git ls-files --others --exclude-standard`. For `mode=session`, filter the
    set to files this session's tool-use events touched (`readEvents` kinds:`["tool-use"]`, normalizing
    `file_path` from Write/Edit/MultiEdit inputs).
  - `GET /git/diff?root=&path=&base=&mode=` → per-file **unified diff** with parsed hunks (id, header,
    old/new ranges, patch text). For untracked text files, synthesize a new-file diff against `/dev/null`.
  - `GET /git/file-version?root=&path=&mode=&base=` → `{ baseText, workingText, status }` — **the base-text
    source for Monaco DiffEditor** (`git show <merge-base>:<relPath>` for the base; working tree for
    working; handles added/untracked = empty base, deleted = empty working, truncation, known-root guard).
    *(This replaces the earlier mistaken idea of a `/files/text?base=` param — base text is git-owned.)*
  - (Phase 5) `POST /git/revert-hunk` — see §9.
- **Base-ref detection:** `refs/remotes/origin/HEAD` → `main` → `master` → a clear `BASE_NOT_FOUND`
  response (no silent arbitrary local branch). Compute `git merge-base <base> HEAD`; diff
  merge-base→working-tree (branch mode = committed-since-base **plus** uncommitted work). Optional
  per-project base override via config/API (no settings UI in v1).
- **Non-git root:** detect "not a git worktree" → a state the UI uses to disable branch & session modes
  (file comments still work).

### 8.2 Diff scoping semantics
- `none` — plain file (today's behavior).
- `current-session` (**default**) — git working-tree diff **filtered** to session-touched files. UI copy:
  "session-touched changes" (honest: misses uncaptured shell/sed edits).
- `whole-branch` — merge-base→working-tree diff over all changed files.

### 8.3 Frontend — diff rendering by renderer kind
- Add a **diff-mode + style control** to the FileViewer `fv-chrome` (next to `LayoutToggle`). **Explicit
  per-tab store slice:** `fileViewerDiffBySession: Record<sessionId, Record<absPath, { mode:
  "none"|"current-session"|"whole-branch"; style: "inline"|"side-by-side" }>>`. Renderers remount on file
  switch, so this lives in the store, not renderer-local. **Resets on reload (not persisted to localStorage
  in v1);** the standalone `/file-tree` uses an in-memory namespace.
- Branch the `FileViewer` switch:
  - **Monaco-readable text** (per `MONACO_EXTS` — incl. `txt`/`log`/`json`/`yaml`, not just "code"):
    Monaco **DiffEditor** fed by `GET /git/file-version` (base + working text). Reading experience only.
  - **markdown / csv:** reuse the inline/side-by-side line-diff styling (`ToolPresentationParts.tsx` CSS —
    styling only, not its naive diffing) fed by server hunks.
  - **binary/image/audio/video/office:** no diff body — "changed" badge only.
- **Inline vs side-by-side** applies to both Monaco DiffEditor (built-in) and the line renderer.
- Per-file **"changed" badge** on `FileRow.tsx` (driven by `/git/changed-files`).
- Live refresh: on the coarse `files.changed{root}` watcher event, **re-fetch** changed-files/diff (no patching).

### 8.4 Edge-state action-availability matrix (do not crash the viewer)
| File status | Diff body | Comment | Revert hunk |
|-------------|-----------|---------|-------------|
| modified (text) | yes | yes | yes |
| added / untracked (text) | new-file diff vs `/dev/null` | yes | **disabled in v1** (or whole-file delete — deferred) |
| deleted | reverse diff (empty working) | yes | yes (restores file) |
| renamed | yes (rename + content) | yes | yes |
| binary / image / office | badge only | file-level comment only | no |

### 8.5 Testing
- Unit: git service parsing (status incl. untracked via `ls-files --others`, hunk parsing) against fixture
  repos; base-ref fallback chain; non-git detection; `file-version` for added/deleted/truncated.
- Unit: session-touch filter (tool-use `file_path` extraction → changed-file intersection).
- Manual/browser: toggle none/session/branch on a real edited repo; inline & side-by-side; non-git disables
  modes; untracked/deleted/binary render sane states.

---

## 9. Phase 5 — Hunk actions (feature 1, part 2)

Depends on phase 3 (file-comment contract) and phase 4 (server hunks).

### 9.1 Comment on a hunk
- Each hunk's **comment** action posts a `file-comment` prose carrying `file_path` + `lines` (hunk
  new-range) + `diff_hunk` (hunk patch text) + `diff_base` (the active mode — exact name per §7.1). This is
  "append the diff + the comment to the conversation."

### 9.2 Revert a hunk (git hunks authoritative)
- Each eligible hunk's **revert** action → `POST /git/revert-hunk` with `{ root, path, base, mode, hunkId }`.
- Server reverse-applies the single hunk: `git apply --reverse --check` first (detect stale/conflicting),
  then apply; on a stale hunk return a clear conflict response. After success the UI re-fetches the diff (no
  in-place patching). Eligibility follows the §8.4 matrix.
- Revert/comment attach to **server hunk IDs/headers/patches**, never Monaco's visual grouping. If
  implementation pressure is high, cut Monaco DiffEditor (uniform server-hunk renderer) **before** cutting
  server hunks.

### 9.3 Testing
- Unit: reverse-apply happy path + stale-hunk conflict (fixture repo); diff refresh after revert.
- Manual/browser: comment a hunk → FileCommentCard shows it; revert a hunk → file changes on disk, diff
  refreshes; stale hunk → conflict message, no corruption.

---

## 10. Phase dependency summary

| Phase | Feature | Depends on | Coupling |
|------|---------|-----------|----------|
| 1 | Configurable layout (incl. extra-pane/resizer) | — | independent, renderer-only |
| 2 | `/file-tree/:sessionId` (read-only) | `listKnownRoots` (§4) | mostly independent |
| 3 | File/line comments | prose allowlist chain + root-relative helper | prerequisite for phase 5 |
| 4 | Read-only diff | `listKnownRoots`, git service, `/git/file-version` | feeds phase 5 hunks |
| 5 | Hunk actions | phases 3 + 4 | comment-on-hunk uses file-comment fields |

**Cross-cutting:** rebuild `packages/shared` before typechecking kernel/renderer whenever `PostProseBody`,
`ProsePayload`, or prose roles change.

## 11. Risks & deferred work

- **Session diff is derived, not exact** — misses uncaptured shell edits; labeled honestly.
- **Hunk revert is the sharpest backend op** — `--reverse --check` before applying; clean conflict responses.
- **Known-root validation is security-sensitive** — only roots from `listKnownRoots` are readable.
- **The prose allowlist chain is all-or-nothing** — all eight layers change together.
- **`commentTarget` discriminator** ripples to ~6 renderer call sites (§7.3) — easy to miss.
- **Standalone comment posting (deferred):** needs a **root-scoped event write/wake API** —
  `client.listEvents`/`postProse`/`wakeSession` gaining a validated `path_id`/root; event POST schemas + the
  stale-path guard (`routes/stalePath.ts`) accepting known non-active roots; handlers resolving
  `makePaths(knownRoot)` instead of active `resolvePaths(deps)`; `GET /sessions/:id/events?path=` tightened
  to the known-root guard. Out of v1; tracked here for the phase-2 follow-up.

## 12. Open items deferred to the human (not blocking the design)

- Exact labels/diagrams for the six layout arrangements in the picker.
- Whether to surface a base-ref override in settings later (v1 is API/config-only).
- Whether `/file-tree` should later gain comment posting (needs §11 root-scoped event API) and/or a
  "promote to active project" action.

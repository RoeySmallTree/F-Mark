# Design — "Within Files" feature set

**Date:** 2026-06-13
**Status:** Draft for review
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
   any of the horizontal arrangements, applied live, persisted to localStorage, defaulting to today's
   layout.

## 2. Non-goals / cut from v1

- No git snapshot/stash/worktree mutation at session creation. (Session diff is derived, not snapshotted.)
- No tool-use "replay" diff fallback for non-git projects — diff modes simply disable there.
- No vertical/stacked/free-2D pane layout — only the six horizontal permutations of the three regions.
- No diff body for binary/image/audio/video/office files — a "changed" badge only.
- No persisted standalone-tab state (favorites, last-focused-session, file-tab persistence) from `/file-tree`.
- No settings UI for branch-base override in v1 — an API/config escape hatch only.
- No Monaco-computed hunks as the source of truth for revert/comment — git hunks are authoritative.
- No cross-tab state synchronization beyond *avoiding* shared-key clobbering.
- No automatic line-drift repair — store the hunk snippet for stable context; current-line reveal is best-effort.

## 3. Architecture principles (ownership boundaries that must not blur)

These three boundaries are the spine of the design; getting them right up front prevents the
expensive mistakes:

- **B1 — `append_to` stays an event→event relationship.** File and diff comments need a *separate*
  file-target prose contract (`file_path` + `lines` + optional `diff_hunk` + `diff_base`). Do not
  overload the existing `commentTarget`/`append_to` shape, which is an event filename used as a DOM
  selector (`packages/renderer/src/state/store.ts` `commentTarget.file`; validator
  `EVENT_FILENAME_RE` in `proseValidate.ts`).
- **B2 — git is authoritative for diff bytes & hunk actions; the session/known-root state is
  authoritative for which files are readable.** Monaco DiffEditor is a *reading* convenience only;
  revert/comment attach to server-produced git hunk IDs.
- **B3 — the standalone `/file-tree` surface is read-mostly and state-isolated.** It must not write
  the shared localStorage keys the main app reads on boot.

---

## 4. Phase 1 — Configurable layout (feature 4)

Independent, renderer-only (plus a localStorage helper). Lowest risk; ships first.

### 4.1 Model & persistence
- New module `packages/renderer/src/themes/layout.ts`, mirroring `themes/density.ts` 1:1:
  - `export type LayoutName` — the six horizontal permutations of the three movable regions
    `{ leftPanel, chat, rightPanel }`. Default `"classic"` reproduces today: `leftPanel | chat | rightPanel`.
    Enumerate the six as named arrangements, e.g. `classic`, `right-left` (panels swapped),
    `chat-left`, `chat-right`, `panels-left` (both panels left of chat), `panels-right`.
  - `STORAGE_KEY = "fmark.layout"`, `LAYOUTS: { name, label, description, slots:[a,b,c] }[]`
    metadata array (drives the picker), `isLayoutName` guard, `getCurrentLayout()` (validated default),
    `applyLayout(name)` (set `data-layout` on `.main` / body class, persist, notify subscribers),
    `subscribeLayout(cb)`.
- **Scope: global** (like theme/density), not per-session/per-project. Pane *widths* remain per-session.
- Apply at boot in `packages/renderer/src/main.tsx` next to `applyTheme`/`applyDensity` (before
  `createRoot`, to avoid FOUC).

### 4.2 Shell CSS
- Convert `.main` (`packages/renderer/src/shell/shell.css` ~11-25) from positional
  `grid-template-columns: auto auto 1fr auto` to **named `grid-template-areas`**. Assign
  `grid-area` to `.left-rail` (always pinned far-left), `.left-panel-host`, `.feed-col`, `.right-panel`.
- Per-layout overrides keyed by `[data-layout="…"] .main { grid-template-areas/columns: … }`.
  The `1fr` track must always belong to whichever slot holds **chat** (`.feed-col`).
- **`extra` pane:** when `.main.has-extra-pane` is active, add an explicit `extra` grid area adjacent
  to the chat slot (today it relies on source order being right-of-chat, which breaks once panels move).

### 4.3 LeftRail
- The 48px `LeftRail` icon nav **stays pinned to the physical left edge** in all layouts (it is primary
  app navigation, not a content pane). The picker labels "Left pane" = the session/path **LeftPanel**,
  explicitly not the rail.

### 4.4 PaneResizer (made layout-aware)
- `packages/renderer/src/components/PaneResizer.tsx` today hard-codes `side` → which width-map it
  mutates (`side="right"` grows LeftPanel; `side="left"` grows RightPanel) and the drag sign.
- Change the contract to **pane identity + current physical edge**: width maps stay keyed by pane
  *identity* (`leftPanelWidthBySession` always = the LeftPanel regardless of side); only the handle
  edge and the drag-sign are derived from the pane's current slot in the active layout.

### 4.5 Picker UI
- Add a row to `packages/renderer/src/modals/settings/Appearance.tsx` (already subscribes to theme +
  density). Add `getCurrentLayout()` state + `subscribeLayout` in the same effect; `pickLayout()` calls
  `applyLayout`.
- Render an **interactive orientation picker**: a small set of clickable diagrams (reuse the
  `.theme-grid`/`theme-card` pattern), each a box mock of the three slots. (Drag-to-assign is a nice-to-have;
  click-to-select preset diagrams satisfies "interactive orientation picker" for v1.)
- Disambiguate from the existing right-pane **"Layout" tab** (`RightLayout.tsx`, which configures
  right-pane *tab* order/visibility) — name this "Pane arrangement" or similar.

### 4.6 Precedence with file-viewer reveal modes
- Pane placement governs the three base regions. File-viewer `replace-chat`/`lower` operate *inside*
  the chat slot; `modal` floats above placement; `extra` uses the explicit `extra` grid area adjacent
  to chat. `/file-tree` (phase 2) uses its own standalone layout and ignores base placement.

### 4.7 Testing
- Pure-function unit tests for `isLayoutName`/`getCurrentLayout` defaults (mirror the density helper style).
- Manual/browser check: switch each arrangement live; confirm widths persist per-identity; confirm
  resizer handle follows the pane and drags in the correct direction; confirm `has-extra-pane` and
  `replace-chat` still render correctly under a swapped layout.

---

## 5. Phase 2 — `/file-tree/:sessionId` standalone tab (feature 3)

### 5.1 Routing (no router library)
- `/file-tree/...` already serves the SPA via the static catch-all (`routes/static.ts` notFoundHandler;
  `/file-tree` is not an API prefix). **No server route needed for the page itself.**
- In `packages/renderer/src/main.tsx` (or top of `App.tsx`), branch on
  `window.location.pathname.startsWith("/file-tree")`: render a new lightweight `<FileTreePage/>`
  instead of `<App/>`. Parse `:sessionId` from the path; read `?token=` with the existing
  `readTokenFromQuery` pattern.
- Route shape: **`/file-tree/:sessionId`** (path param, per the brief). Token rides `?token=`.
- On load, validate `sessionId` against `listAllSessions()`; resolve to its `path` + `path_id`
  (`SessionWithPath` in `packages/shared/src/sessions.ts`). Show a local not-found state if missing;
  `path_id` disambiguates collisions across roots.

### 5.2 Backend — the read fork (decision C1 = option b)
- **Extend `/files/text` and `/files/content` to accept a per-request root**, validated against the set
  of **known registered roots** — *not* an arbitrary client path.
  - Source of allowed roots: the same set `routes/sessions.ts` already uses to build all-sessions —
    `state.knownPaths` (`packages/kernel/src/state/store.ts`) + active path, via the paths registry
    (`packages/kernel/src/paths/registry.ts`). Add a shared `isKnownRoot(root)` guard.
  - Routes accept an optional `root`/`path_id` query; when present, validate it is a known root and
    that the requested file canonicalizes inside it (reuse `resolveBrowsePath` + a parameterized
    `projectRootGuard(root, canonical)` instead of the hard-coded `paths.root()`).
  - When absent, behavior is unchanged (active project root) — backward compatible.
- `/files/tree` already accepts an arbitrary `root`; tighten it to also validate against known roots
  for consistency (defensive, low-risk).
- **Do not** flip the server's global active path from the dropdown (that would yank every other open
  tab via the `path-switched` WS broadcast).

### 5.3 Frontend — `<FileTreePage/>`
- Compose the existing store-driven components: `RightFiles` (tree) + `FileViewer` (viewer) in a fixed
  standalone layout (tree left, viewer right). Reuse `PathSwitcher.tsx`'s open/outside-click/Escape
  pattern for the **session dropdown** (populated from `listAllSessions()`), shown above the panes.
- Seed minimal store state from the URL (token, resolved path/path_id, session id). **State isolation
  (B3):** suppress the shared-localStorage side effects — do not call `setCurrentSession`'s
  last-focused persistence; keep file tabs ephemeral/in-memory or under a route-namespaced key. Add an
  explicit "standalone mode" flag rather than reusing the full `App` boot path.
- The session dropdown re-scopes *this tab only* (sets local path/session + refetches tree/content via
  the per-request root), never the server active path.
- `client.fetchFileText`/`fileContentUrl`/`fetchFilesTree` gain an optional `root`/`path_id` arg that
  threads to the extended endpoints.

### 5.4 Scope of the standalone page
- File browsing + viewing with **ephemeral tabs**. No shared favorites / last-focused / file-tab
  persistence writes (those are not needed to "open in a new tab").
- **Exception:** posting file comments (phase 3) *is* a legitimate write to the selected session's
  event log — allow it once phase 3 has shipped; until then `/file-tree` is read-only.

### 5.5 Launching
- A control (e.g. a button in the file viewer chrome / TopBar) calls
  `window.open('/file-tree/' + sessionId + '?token=' + token, '_blank')`.

### 5.6 Testing
- Unit: `isKnownRoot` guard (accept known roots incl. nested files; reject unknown/escape paths).
- Unit: sessionId→path resolution + not-found path.
- Manual/browser: open the tab, switch sessions via dropdown, read files from a non-active session's
  root, confirm the main app tab is undisturbed (no path-switch, no localStorage bleed).

---

## 6. Phase 3 — File/line comments (feature 2)

This is the **prerequisite** for feature 1's "comment on a hunk."

### 6.1 Data model — new prose role `file-comment`
A new prose **sub-role** (not a new `EventKind`), classified from new frontmatter fields. New fields on
`ProseFrontmatter` / `ProsePayload` / `PostProseBody`:
- `file_path: string` — **project-root-relative** path (survives project moves; resolved against the
  selected session root). Absolute paths out of scope for v1.
- `lines?: [number, number]` — **advisory** (may drift as the file changes); reuse the existing field.
- `diff_hunk?: string` — the unified-diff hunk text (stable display context; supplied by feature 1).
- `diff_base?: "working" | "session" | "branch" | string` — the diff mode/base the comment was made
  against (a commit sha is allowed). Distinguishes branch/session/working hunk comments on the same
  line so they don't collapse into one thread.

### 6.2 The full allowlist chain (must all change together, or comments fail silently/hard)
- `packages/shared/src/events.ts` — add the four fields to `ProseFrontmatter`/`ProsePayload`.
- `packages/shared/src/eventContracts.ts` — add them to `PostProseBody`.
- `packages/shared/src/proseRoles.ts` — add a `file-comment` variant to `ProseRole`; in
  `getProseRole()`, return it when `file_path` is set, **with precedence before the `append_to` branches**.
- `packages/shared/src/blocks.ts` — add `getFileCommentTarget(payload)` (parallel to `getCommentTarget`).
- `packages/kernel/src/events/prose.ts` — emit the new fields in `pickFrontmatter`; read them in
  `parseProse` (both are explicit allowlists — unknown keys are dropped).
- `packages/kernel/src/events/proseValidate.ts` — add a rule branch: `file_path` (non-empty) is a valid
  *self-contained* comment target; allow `lines` when `file_path` is set even without `mode`/`append_to`;
  **reject `file_path` together with `append_to`/`mode`**. Keep `EVENT_FILENAME_RE` for `append_to` only.
  *(This is more than renderer branching — the validator currently requires `lines`↔`mode:"comment"` and
  `mode`↔`append_to`, which would reject a file comment.)*
- `packages/kernel/src/services/events.ts` — copy the fields in `prosePayload()`; pass to the validator.
- `packages/kernel/src/routes/events.ts` — add the fields to the prose POST JSON schema
  (`additionalProperties:false` rejects unknown fields otherwise).
- `packages/kernel/src/mcp/tools.ts` — add the fields to `fmark_post_prose` (decision B6: yes, agents can
  post/answer file comments). **Do this *after* the parser/serializer/validator changes**, or agents
  will believe they anchored comments the event log silently dropped.

### 6.3 Renderer
- `packages/renderer/src/state/aggregate.ts` — treat `file-comment` as comment-activity (so it appears in
  the feed, not flagged as an orphan block); add a `fileCommentsByPath` bucket. Edit/resolve/delete and
  supersede are content-encoded conventions handled generically by filename — file comments inherit them
  for free as prose events.
- `packages/renderer/src/cards/EventCard.tsx` — dispatch `file-comment` → a new card.
- New `packages/renderer/src/cards/FileCommentCard.tsx` (dedicated, not an extension of
  `CommentActivityCard`): shows the path, a line/hunk label, and a hunk snippet. Click → open Comments tab
  + focus the file/line.
- `packages/renderer/src/panels/right/RightComments.tsx` — `buildCommentGroups` also buckets file comments;
  grouping key = **`file_path::diff_base::hunk`** when hunk metadata exists, falling back to
  `file_path::lines` for ordinary line comments. `postComment` can post the file-target shape.
- `packages/renderer/src/state/store.ts` — extend `commentTarget` with a **discriminator**
  (`{ kind: "event"; file } | { kind: "file"; file_path; lines? }`) since the existing `file` is an event
  filename used as a DOM selector.

### 6.4 The line-comment affordance in the file viewer
- The existing `LineCommentRail.tsx` is built around rendered markdown/prose line measurement
  (`commentable-content` boxes) — it is the *mechanism template* but is not directly reusable over Monaco.
- **Code (Monaco) files:** add a glyph-margin + decorations + `onDidChangeCursorSelection` affordance
  inside `MonacoRenderer.tsx`. Hover/select a line (or a selected range) → an "add comment" action →
  draft popover → post a `file-comment` prose with `file_path` + `lines`. Expose an imperative handle for
  `revealLine` (needed for B5 reveal-on-click).
- **Rendered non-code (markdown/csv):** wrap the renderer body in a `LineCommentRail`-style overlay.
- Both paths set `commentTarget` (file-kind), call `setRightTab("comments")` (the existing
  `commentTarget`→auto-open-Comments path), post via `client.postProse`, and wake mentioned/authoring
  agents (the existing `wakeSession` call).

### 6.5 Focus/scroll behavior (B5)
- Clicking a file comment opens the referenced file in the viewer and reveals the target line/hunk
  (Monaco `revealLine` via the imperative handle; best-effort for non-code).
- In `/file-tree/:sessionId` there is **no feed anchor** — the standalone page opens/reveals in its local
  viewer and keeps the comment thread in list mode; it must not try to scroll `.feed-scroll`.

### 6.6 Testing
- Unit: `getProseRole` classifies `file-comment`; `validateProseFrontmatter` accepts `file_path`+`lines`
  and rejects `file_path`+`append_to`; round-trip serialize/parse preserves the new fields.
- Unit: `buildCommentGroups` keying (`file_path::diff_base::hunk` vs `file_path::lines`).
- Manual/browser: select lines in a code file → comment → appears in feed (FileCommentCard) + Comments tab;
  click it → opens file + reveals line; agent posts a reply via MCP.

---

## 7. Phase 4 — Read-only diff (feature 1, part 1)

### 7.1 Backend — `routes/git.ts` + a git service
- New `packages/kernel/src/git/*` service shelling git via `node:child_process` (mirror the testable
  `tmux/commandRunner.ts` pattern; **no new dependency**). All paths go through `resolveBrowsePath` + the
  parameterized known-root guard.
- New `packages/kernel/src/routes/git.ts` (registered in `server.ts` alongside the other file routes).
  **Add `/git` to the static fallback API-prefix allowlist** (`routes/static.ts`) so a missing endpoint
  returns JSON 404 instead of `index.html`.
- Endpoints (all accept the known-root + optional `sessionId`):
  - `GET /git/changed-files?root=&base=&mode=branch|session` → list of changed files with status
    (added/modified/deleted/renamed/untracked) and per-file change counts. For `mode=session`, **filter**
    the working-tree changed set to files this session's tool-use events touched (scoping hint via
    `readEvents` kinds:`["tool-use"]`, normalizing `file_path` from Write/Edit/MultiEdit inputs).
  - `GET /git/diff?root=&path=&base=&mode=` → per-file **unified diff** with parsed hunks (each hunk:
    id, header, old/new ranges, patch text).
  - (Phase 5) `POST /git/revert-hunk` — see §8.
- **Base ref detection (A2):** `refs/remotes/origin/HEAD` → `main` → `master` → a clear
  `BASE_NOT_FOUND` response (no silent arbitrary local branch). Compute `git merge-base <base> HEAD` and
  diff merge-base→working-tree (so branch mode = committed-since-base **plus** uncommitted work). Optional
  per-project base override via config/API (no settings UI in v1).
- **Non-git root:** detect "not a git worktree" and return a state the UI uses to disable branch & session
  modes (file comments still work — A3).

### 7.2 Diff scoping semantics
- `none` — plain file (today's behavior).
- `current-session` (**default**) — git working-tree diff **filtered** to session-touched files. UI copy:
  "session-touched changes" (honest: misses uncaptured shell/sed edits — A1).
- `whole-branch` — merge-base→working-tree diff over all changed files.

### 7.3 Frontend — diff rendering by renderer kind (A4)
- Add a **diff-mode control** to the FileViewer `fv-chrome` (next to `LayoutToggle`), state stored **per
  tab in the store** (renderers remount on file switch, so diff state cannot be renderer-local).
- Branch the `FileViewer` switch:
  - **Monaco-readable text/code** (per `MONACO_EXTS` — includes `txt`/`log`/`json`/`yaml` etc., not just
    "code"): render Monaco **DiffEditor** (client computes the visual diff from base + working text fetched
    via the extended `/files/text?…&base=`). Reading experience only.
  - **markdown / csv:** reuse the existing inline/side-by-side line-diff style
    (`ToolPresentationParts.tsx` CSS — reuse the styling, not its naive diffing) fed by server hunks.
  - **binary/image/audio/video/office:** no diff body — a "changed" badge only.
- **Inline vs side-by-side** toggle applies to both Monaco DiffEditor (built-in) and the line renderer.
- A **per-file "changed" badge** can appear on `FileRow.tsx` in the tree (driven by `/git/changed-files`).
- Live refresh: the watcher only emits a coarse `files.changed{root}` — on that event, **re-fetch** the
  changed-files/diff (do not attempt to patch).

### 7.4 Edge states (do not crash the viewer — E2)
- Deleted / renamed / untracked / binary files each need an explicit diff state in the UI; never route
  them through the normal text path blindly.

### 7.5 Testing
- Unit: git service parsing (changed-files status, hunk parsing) against fixture repos; base-ref detection
  fallback chain; non-git detection.
- Unit: session-touch filter (tool-use `file_path` extraction → changed-file intersection).
- Manual/browser: toggle none/session/branch on a real edited repo; inline & side-by-side; non-git repo
  disables modes; deleted/untracked files render a sane state.

---

## 8. Phase 5 — Hunk actions (feature 1, part 2)

Depends on phase 3 (file-comment contract) and phase 4 (server hunks).

### 8.1 Comment on a hunk
- Each hunk in the diff view gets a **comment** action → posts a `file-comment` prose carrying
  `file_path` + `lines` (from the hunk's new-range) + `diff_hunk` (the hunk patch text) + `diff_base`
  (the active mode). This is the "append the diff + the comment to the conversation" behavior.

### 8.2 Revert a hunk (A5 — git hunks authoritative)
- Each hunk gets a **revert** action → `POST /git/revert-hunk` with `{ root, path, base, mode, hunkId }`.
- Server reverse-applies the single hunk: `git apply --reverse --check` first (detect stale/conflicting
  hunks), then apply; on a stale hunk return a clear conflict response. After success, the UI re-fetches
  the diff (no in-place patching).
- Revert/comment actions attach to **server hunk IDs/headers/patches**, never Monaco's visual grouping.
- If implementation pressure is high, cut Monaco DiffEditor (uniform server-hunk renderer) **before**
  cutting server hunks (A5 fallback).

### 8.3 Testing
- Unit: reverse-apply happy path + stale-hunk conflict (fixture repo); diff refresh after revert.
- Manual/browser: comment a hunk → FileCommentCard shows the hunk; revert a hunk → file changes on disk,
  diff refreshes; stale hunk → conflict message, no corruption.

---

## 9. Phase dependency summary

| Phase | Feature | Depends on | Coupling |
|------|---------|-----------|----------|
| 1 | Configurable layout | — | independent, renderer-only |
| 2 | `/file-tree/:sessionId` | known-root guard | mostly independent; shares root discipline |
| 3 | File/line comments | prose allowlist chain | prerequisite for phase 5 |
| 4 | Read-only diff | known-root guard, git service | feeds phase 5 hunks |
| 5 | Hunk actions | phases 3 + 4 | comment-on-hunk uses file-comment fields |

**Cross-cutting:** rebuild `packages/shared` before typechecking kernel/renderer whenever
`PostProseBody`, `ProsePayload`, or prose roles change.

## 10. Risks & things easy to underestimate

- **Session diff is derived, not exact** — it misses uncaptured shell edits; label it honestly.
- **Hunk revert is the sharpest backend op** — must `--reverse --check` before applying and return clean
  conflict responses on stale hunks.
- **Known-root validation is security-sensitive** — the new middle ground (between active-root-only and
  arbitrary roots) must allow *only* known registered project roots.
- **The prose allowlist chain is all-or-nothing** — shared types, role classifier, blocks helper, kernel
  parser/serializer, validator, route schema, API client, and MCP tool must change together.
- **Store isolation for `/file-tree`** is easy to underestimate — current store actions persist session
  focus and file tabs as side effects.
- **Layout resizer** — width ownership and drag direction must derive from the pane's current slot, not a
  hard-coded prop, once panes can move; the `extra` column needs an explicit grid area.

## 11. Open items deferred to the human (not blocking the design)

- Exact labels/diagrams for the six layout arrangements in the picker.
- Whether to surface a base-ref override in settings later (v1 is API/config-only).
- Whether `/file-tree` should later gain a "promote to active project" action (out of scope now).

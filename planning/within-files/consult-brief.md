# Consultation brief — "Within Files" feature set (4 features)

You (Codex, gpt-5.5 xhigh) are being asked for a **design consultation only** — read the code, then
produce a **decisions document** at `planning/within-files/decisions.md`. Do NOT modify any source
code, configs, or tests. Output is findings + recommendations only.

## Why you're being consulted

I (Claude) am brainstorming the design for 4 new features in the F-Mark app. The human owner has
delegated all my open design questions to you: I will **proceed with your answers**. So be decisive —
for each decision point, pick an option, justify briefly, and flag anything I've missed or gotten wrong.
Favor the smallest correct design that fits existing patterns (YAGNI), and call out phasing.

## Repo context

- Monorepo (pnpm): `packages/kernel` (Fastify/Node backend), `packages/renderer` (React SPA, zustand
  store, **no router**), `packages/shared` (DTOs/types). Convention: package is `f-mark`; **shared must
  be rebuilt before kernel/renderer see new exports**.
- Current branch `feat/model-effort-control` has unrelated uncommitted work — IGNORE it; our feature is
  separate and will get its own branch.
- The renderer file viewer uses `monaco-editor@0.52.2` + `@monaco-editor/react` (so Monaco DiffEditor is
  available). There is **zero git integration** in the kernel today (verified: no simple-git/isomorphic-git,
  no child_process git). Sessions are append-only event-file folders under `.f-mark/sessions/<id>/` with
  **no branch/working-dir/base-commit binding**.

## The 4 features (verbatim from the human)

1. **Diff toggle** within files: none / current-session (default) / overall-of-branch. Needs proper
   tracking — both against git AND the current session's changes. Side-by-side / inline diff styles. Each
   changed item gets a **revert** option and a **comment** option (comment appends the diff + the comment
   to the conversation — see feature 2).
2. **Line comments**: hovering/selecting lines gives "add comment" — the SAME mechanism as commenting on
   documents in the chat. Appends a new kind of message/prose, enabling conversations over lines/diffs/parts
   of files, and triggers the comments tab.
3. **Open file in new tab**: open files (with the tree explorer in the right pane) in a new browser tab. A
   route `/file-tree` with the session id as a param (shown above, changeable via a dropdown, initially the
   launching session).
4. **Configurable layout**: settings option to place the left pane, right pane, and chat pane wherever the
   user likes (interactive orientation picker), affecting the app live, saved to localStorage, defaulting to
   the current layout.

## Verified architecture map (read these files to confirm/extend)

### Shell & layout (feature 4)
- `packages/renderer/src/App.tsx` — macro layout JSX (lines ~533-558): `.app` > TopBar + `.main` containing
  `LeftRail, LeftPanel, feed-col (or ReplaceChatShell), [ExtraPaneShell], RightPanel` in fixed source order.
- `packages/renderer/src/shell/shell.css` — `.main { display:grid; grid-template-columns: auto auto 1fr auto }`
  (~11-18); `.main.has-extra-pane` 5-col (~23-25). No `grid-template-areas`, no `order` today.
- `packages/renderer/src/components/PaneResizer.tsx` — `side` prop hard-codes screen edge + which width-map it
  mutates (side='right' grows LeftPanel; side='left' grows RightPanel).
- `packages/renderer/src/themes/index.ts` + `themes/density.ts` + `main.tsx` (applyTheme/applyDensity before
  createRoot) — the canonical GLOBAL/localStorage/live-apply/subscribe pattern (no FOUC). `state/settings.ts`
  flat `fmark:settings:` helpers. `modals/settings/Appearance.tsx` is the natural home; `SettingsModal.tsx`
  SECTIONS array. Note naming collision: existing `RightLayout.tsx` "Layout" tab configures right-pane TAB
  order/visibility — different concept from pane PLACEMENT.
- LeftRail is a separate 48px icon nav element from LeftPanel. Pane widths are per-session inline styles.

### File viewer & tree (features 1, 2, 3)
- `packages/renderer/src/panels/fileViewer/FileViewer.tsx` — switch over `pickRenderer(extOf(active))`, leaf
  keyed by path (remounts on file switch → diff/comment state must live in store, not local). `fv-chrome`
  holds TabsRow + `LayoutToggle.tsx`.
- `packages/renderer/src/panels/fileViewer/renderers/MonacoRenderer.tsx` — lazy monaco, `fetchFileText` 8MB
  cap, read-only, theme via MutationObserver. `pickRenderer.ts` MONACO_EXTS defines "code".
- `packages/renderer/src/panels/right/RightFiles.tsx` + `panels/right/files/{buildTreeView.ts,FileTree.tsx,
  FileRow.tsx}` — the tree (flat parent-index array, gitignore-filtered, 25k cap). FileRow.openFile(absPath).
- `packages/renderer/src/cards/toolPresentation.tsx` (filePathFrom ~54; inline ToolDiff old/new ~256-292) and
  `cards/ToolPresentationParts.tsx` (~190-279, inline vs side-by-side toggle, synced scroll) — the ONLY diff UI
  today; naive line-list, NOT computed hunks. Reusable CSS, not the diffing.

### Comments / prose system (features 1, 2)
- A comment is a **prose event** (not a new EventKind). `packages/shared/src/events.ts` (EventKind union ~1-15;
  ProseFrontmatter/ProsePayload ~35-71). Prose SUB-ROLE is derived at read time by
  `shared/src/proseRoles.ts:getProseRole()` from frontmatter shape (message/anchor/named-block/unnamed-block/
  comment/tombstone). `shared/src/blocks.ts:getCommentTarget()`. `shared/src/eventContracts.ts:PostProseBody`.
- Existing comment = prose with `append_to` (an EVENT filename, validated by `EVENT_FILENAME_RE`) + `mode:"comment"`
  + optional `lines:[a,b]`. KEY GAP: `append_to` is an event filename, NOT a repo path — file/line comments need a
  new prose role keyed off new fields (`file_path` + `diff_hunk`, reuse `lines`).
- Kernel write/validate path: `kernel/src/services/events.ts:writeProseEvent` → `normaliseProseBody` →
  `events/proseValidate.ts:validateProseFrontmatter` (strict mutual-exclusion: `lines` requires `mode:"comment"`,
  `mode` requires `append_to`) → `prosePayload()` → `events/prose.ts:serializeProse`/`parseProse` (both ALLOWLIST
  frontmatter keys — unknown keys dropped). Route `routes/events.ts` POST `/sessions/:id/events/prose` uses Fastify
  `additionalProperties:false`. `mcp/tools.ts:fmark_post_prose`.
- Renderer: `cards/LineCommentRail.tsx` (line hover/drag-select affordance over prose; posts append_to+mode+lines
  ~660; wakeSession). `state/aggregate.ts` builds `commentsByTarget`. `panels/right/RightComments.tsx`
  (`buildCommentGroups` ~223 buckets by getCommentTarget; resolves anchors against an events-by-filename map; scrolls
  to `[data-event-filename]`). `cards/EventCard.tsx` dispatch (`comment`→CommentActivityCard). `store.ts`
  `commentTarget:{file,lines}` where `file` is an EVENT filename used as a DOM selector (needs a discriminator for
  file-path targets); `setRightTab`; RightPanel auto-switches to comments when commentTarget set.

### Routing / SPA serving / file reads (feature 3)
- NO router. `main.tsx` mounts `<App/>` once. Only `window.location` read is `?token=` (App.tsx ~51).
- `kernel/src/routes/static.ts` — @fastify/static at `/` + `setNotFoundHandler` (~79-95) returns index.html for any
  non-API path (API_PREFIXES allowlist ~50-62). So `/file-tree/:id` already serves the SPA — no server route change.
- **BIG FORK**: `kernel/src/routes/filesText.ts` + `filesContent.ts` enforce `projectRootGuard` against
  `paths.root()` (the single server-wide ACTIVE project root). `filesTree.ts` accepts an ARBITRARY `?root=`. So a
  standalone page can render the TREE for any session's path but CANNOT read file BODIES unless that session's path
  == the server's active path. Switching the dropdown to a non-active session requires either (a) POST /paths/active
  (disrupts ALL open tabs via a `path-switched` WS broadcast) or (b) backend change to relax filesText/filesContent
  to accept a per-request root validated against known/registered roots.
- The zustand store is a per-tab singleton but persists to SHARED localStorage (file tabs, last-focused session,
  widths) → cross-tab state-bleed risk for a second tab.
- Reusable: `RightFiles` + `FileViewer` are store-driven (activePath + currentSessionId). `PathSwitcher.tsx` is the
  dropdown pattern. `client.listSessions`/`listAllSessions`.

### Backend git/change-tracking gap (feature 1)
- No git anywhere. Shelling git via `node:child_process` (pattern in `tmux/commandRunner.ts`) is the no-new-dep path.
- No per-session change source of truth. Only `tool-use` events (`shared/src/events.ts` ToolUsePayload ~192) capture
  file edits in `payload.input` (Write/Edit/MultiEdit), best-effort and runtime-dependent (Claude via PostToolUse
  hook reliable; Codex/opencode via transcript parsing partial; **bash/sed edits NOT captured**). `events/reader.ts`
  readEvents can query tool-use events. The watcher emits only a coarse `files.changed{root}` (no path list).

## Decision points — give me your call on each (confirm / override + 1-3 sentence why)

**A. Diff & session-change tracking (feature 1)**
- A1. Session-diff baseline. My lean: **(c) hybrid** — use real git as the content source of truth (working-tree
  diff), but SCOPE "current session" to the set of files this session's tool-use events touched (so the toggle =
  "git working changes, filtered to files this session edited"). Alternatives: (a) tool-use old/new replay (cheap,
  lossy, misses bash edits, no baseline for net-new) or (b) git snapshot/stash at session create (accurate but
  mutates repo, assumes git). Your call?
- A2. "Whole-branch" base ref: auto-detect default branch (main/master) + `git merge-base`, diff `base...HEAD` plus
  working tree. Confirm or propose a per-project config override.
- A3. Non-git project UX: disable/hide both the branch AND session toggles (both need git in the hybrid model); only
  "none" available. OK, or should session mode fall back to tool-use replay when not a git repo?
- A4. Diff for non-code (markdown/csv/office) vs code: code → Monaco DiffEditor (client computes from two texts);
  text non-code → reuse the inline/side-by-side line renderer; binary/image → no diff (badge only). Agree?
- A5. Hunk granularity for revert/comment: get unified-diff hunks from `git diff` server-side (authoritative), render
  per-hunk revert (reverse `git apply` of the single hunk) and per-hunk comment. For code we ALSO show Monaco
  DiffEditor for the reading experience but drive revert/comment off the server hunks. Is dual-path (Monaco for
  reading + git hunks for actions) acceptable, or should we render git hunks uniformly and drop Monaco DiffEditor?
- A6. New kernel surface: a `routes/git.ts` (changed-files list, per-file unified diff, per-hunk revert) +
  `routes/sessionChanges.ts` (or fold session-scoping into git route via a session-files filter). Confirm shape.

**B. File/line comments (feature 2)**
- B1. Anchor model: store `file_path` + `lines:[a,b]` + optional `diff_hunk` + a `base_ref` discriminator
  (`"working"|"session"|"branch"|commit-sha) so the line range is reproducible. Lines authoritative or advisory?
  My lean: store path+lines+hunk+base_ref; treat lines as advisory (may drift), hunk as the stable display.
- B2. Implement as a **new prose role `file-comment`** keyed off `file_path` (NOT a new EventKind), via the minimal
  file set the map lists (shared events/proseRoles/blocks/eventContracts; kernel prose/proseValidate/services.events/
  routes.events; renderer aggregate/EventCard/card/RightComments/LineCommentRail/store). Confirm.
- B3. Comments-tab grouping key: by `file_path`, then sub-group by line-range/hunk. Confirm.
- B4. Card: dedicated `FileCommentCard` rendering path + line label + hunk snippet (vs extending CommentActivityCard).
  My lean: dedicated card. Agree?
- B5. Focus/scroll when the referenced file isn't open: clicking a file comment opens the file in the viewer and
  scrolls to the line (Monaco revealLine). Confirm; what's the behavior in the new-tab /file-tree surface?
- B6. Should agents post/answer file comments via MCP (`fmark_post_prose` gains the fields)? My lean: yes (enables
  agent conversations over diffs), low cost. Agree?

**C. Open-in-new-tab /file-tree (feature 3)**
- C1. THE fork: dropdown switching sessions/roots → (a) flip server active path (simple, disrupts other tabs) vs
  (b) relax `filesText`/`filesContent` guard to accept a per-request `root`/session that's validated against the set
  of KNOWN registered roots (non-disruptive, enables true multi-session viewing). My lean: **(b)** — extend the guard
  to allow any known project root, since the feature's whole point is viewing arbitrary sessions side-by-side. Your
  call, incl. how to enumerate "known roots" safely (registered paths only? session-bound roots?).
- C2. Store isolation for the second tab: derive session from the URL and AVOID writing last-focused-session /
  clobbering shared localStorage keys the main tab reads on boot. Read-mostly, namespaced where it must write. OK?
- C3. Route shape: `/file-tree/:sessionId` (path param) vs `/file-tree?session=`. Brief says "session id as the param".
  My lean: path param. Token rides `?token=`. Confirm.
- C4. Scope of the standalone page: full file browsing + viewer tabs, but writes (favorites, open-tab persistence)
  kept local/ephemeral to avoid polluting the main app. Read-only vs limited-write? My lean: viewing + ephemeral tabs,
  no shared-state writes.

**D. Configurable layout (feature 4)**
- D1. Scope: **global** (theme/density module pattern), persisted to localStorage, default = current layout. Confirm
  (vs per-project / per-session).
- D2. Picker fidelity: the brief says "place left/right/chat panes wherever … interactive orientation picker". My lean:
  support the finite set of **horizontal permutations** of the 3 regions {left-panel, chat, right-panel} via CSS
  `grid-template-areas` (chat keeps the `1fr` track wherever it goes), with an interactive picker (drag/assign each
  region to a slot). DEFER true 2D/vertical/stacked placement (the single-row grid can't do it without a bigger
  restructure). Agree, or is vertical stacking in-scope for v1?
- D3. Does the LeftRail 48px icon nav travel with the left panel, or stay pinned to the screen's left edge? My lean:
  stays pinned (it's primary app nav). Agree?
- D4. PaneResizer must become layout-aware (compute `side` + which width-map from the pane's current physical slot,
  not a hard-coded prop). Confirm this is the right fix.
- D5. Precedence with the file-viewer's own reveal modes (replace-chat/extra/lower/modal) and the new /file-tree
  route: placement governs the 3 base regions; a file-viewer shell operates WITHIN the chat slot (replace-chat) or as
  the extra column. Confirm precedence; any conflict you foresee?

**E. Cross-cutting**
- E1. Phasing/sequencing: propose a build order across the 4 features (which are independent, which share
  prerequisites — e.g. feature 1's diff_hunk feeds feature 2's comment payload; feature 2's file-comment prose role is
  a prerequisite for feature 1's "comment on hunk"). 
- E2. Biggest risks / things I'm underestimating. Anything in the map that's wrong or that you'd design differently.
- E3. Anything that should be CUT from v1 for YAGNI.

## Deliverable

Write `planning/within-files/decisions.md` with: a short verdict per decision point (A1…E3) — chosen option,
1-3 sentence rationale, and any correction/gap. End with a recommended phase plan and a "things to cut" list.
Be decisive; I will implement against your answers. Do not edit any other file.

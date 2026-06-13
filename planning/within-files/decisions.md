# Within Files Decisions

## A. Diff and Session-Change Tracking

### A1. Session-diff baseline
Chosen: (c) hybrid. Use git as the content source of truth, and define "current session" as the working-tree git diff filtered to files touched by this session's captured tool-use events.

Rationale: F-Mark has no session baseline or repo binding at session creation; sessions are just event folders created under the current project (`packages/kernel/src/sessions.ts:85-93`). Tool-use events are available and queryable (`packages/shared/src/events.ts:192-202`, `packages/kernel/src/events/reader.ts:38-82`), but hook capture is best-effort (`packages/kernel/src/hooks/autoStream.ts:667-701`, `packages/kernel/src/hooks/projectTurn.ts:296-303`). Git must be authoritative for bytes; tool-use is only a scoping hint.

Correction/gap: Do not label this a true historical session diff. It will miss uncaptured shell edits and any file touched outside recorded Write/Edit/MultiEdit-style tools. The UI copy should say "session-touched changes" or similar, not "all changes made by this session."

### A2. Whole-branch base ref
Chosen: Auto-detect the default branch, compute `git merge-base <base> HEAD`, and diff that merge-base against the working tree. Add a per-project override for the base ref, but cut the settings UI for the first slice.

Rationale: The feature needs branch-relative changes plus uncommitted work, so the endpoint should diff from the merge-base to the current working tree rather than only `base...HEAD`. The kernel already has project config plumbing (`packages/kernel/src/project.ts:9-13`, `packages/kernel/src/project.ts:78-83`), so an optional config field or API override is a small escape hatch for non-main default branches.

Correction/gap: "default branch = main/master" is too brittle. Prefer `refs/remotes/origin/HEAD`, then `main`, then `master`, then a clear "base not found" response. Do not silently pick an arbitrary local branch.

### A3. Non-git project UX
Chosen: Disable branch and session diff modes when the selected root is not inside a git worktree; leave only "none" available.

Rationale: The hybrid design depends on git for actual before/after content. Tool-use replay alone would be lossy and would not cover untracked net-new files, bash/sed edits, or current file bytes reliably. A disabled control with "git repository required" is more honest than a partial fallback.

Correction/gap: File comments should still work in non-git projects. Only diff modes and hunk actions should be disabled.

### A4. Diff by renderer kind
Chosen: Use Monaco DiffEditor for Monaco-readable text/code files, use the existing lightweight line diff style for markdown and CSV, and show no diff body for binary/image/audio/video/office in v1.

Rationale: `FileViewer` dispatches by renderer kind and remounts by active path (`packages/renderer/src/panels/fileViewer/FileViewer.tsx:45-82`). Monaco is already lazy-loaded for many text extensions (`packages/renderer/src/panels/fileViewer/renderers/MonacoRenderer.tsx:55-105`, `packages/renderer/src/panels/fileViewer/renderers/pickRenderer.ts:99-111`), while the existing tool diff UI is presentation-only line rendering (`packages/renderer/src/cards/ToolPresentationParts.tsx:179-279`).

Correction/gap: "Code" is not the exact boundary; `txt`, `log`, JSON, YAML, and similar files are currently Monaco-rendered. Office files should not get a text diff in v1 unless a real text extraction path is added.

### A5. Hunk granularity for revert/comment
Chosen: Use server-produced git hunks as the only action surface. Monaco DiffEditor is acceptable for reading code diffs, but revert/comment buttons must attach to server hunk IDs, headers, and patches.

Rationale: Hunk revert must be based on authoritative unified diff data from git, not on whatever visual grouping Monaco computes. The current tool diff renderer does not compute hunks at all; it just displays old/new strings (`packages/renderer/src/cards/toolPresentation.tsx:256-292`). Keep "read the diff" and "act on this hunk" separate.

Correction/gap: If implementation pressure is high, cut Monaco DiffEditor before cutting server hunks. A uniform server-hunk inline/side-by-side renderer is smaller and safer than a beautiful code diff with unreliable hunk actions.

### A6. New kernel surface
Chosen: Add one `routes/git.ts` route group plus a git service. Fold session scoping into the git endpoints via an optional `sessionId` filter instead of creating a separate `sessionChanges` route.

Rationale: The kernel has no git dependency today, but it already shells commands via `node:child_process` in a testable command-runner pattern (`packages/kernel/src/tmux/commandRunner.ts:14-21`). A single git route can serve changed files, per-file unified diffs, parsed hunks, and hunk revert; session mode just filters changed files using `readEvents`.

Correction/gap: Add `/git` to the static fallback API prefix list when adding the route. The current fallback only marks some API prefixes (`packages/kernel/src/routes/static.ts:50-62`), so a missing `/git/...` endpoint could otherwise fall through to `index.html` instead of a JSON 404.

## B. File and Line Comments

### B1. Anchor model
Chosen: Store a prose file-comment target with project-root-relative `file_path`, advisory `lines`, optional `diff_hunk` metadata, and a base discriminator such as `diff_base` or `base_ref`.

Rationale: Existing file browsing uses absolute paths in the renderer, but persisted events should be root-relative so comments survive project moves and can be resolved against the selected session root. Lines should be advisory because files drift; the hunk header/snippet is the stable display context.

Correction/gap: Do not persist absolute paths unless the file is genuinely outside the project root, which should be out of scope for v1. Include the diff mode/base in the target when a hunk comment is created, otherwise branch/session/working hunk comments on the same line can collapse into one thread.

### B2. Prose role, not EventKind
Chosen: Implement `file-comment` as a new prose role keyed by `file_path`, not as a new `EventKind`.

Rationale: `EventKind` is a closed event union and comments are already prose (`packages/shared/src/events.ts:1-15`, `packages/shared/src/proseRoles.ts:19-25`). The existing write path, parser, serializer, and Fastify schema all explicitly allowlist prose fields (`packages/kernel/src/events/prose.ts:8-22`, `packages/kernel/src/routes/events.ts:80-136`), so this must be a coordinated shared/kernel/renderer change.

Correction/gap: The map is materially right that `append_to` cannot hold a repo path, but it understates the validator issue. Current validation requires `append_to` to match an event filename and requires `lines` to be paired with `mode: "comment"` (`packages/kernel/src/events/proseValidate.ts:96-127`), so file comments need new validation rules, not just new renderer branching.

### B3. Comments-tab grouping key
Chosen: Group file comments by `file_path`, then by line range or stable diff hunk key; include the base discriminator for hunk comments.

Rationale: `RightComments` currently buckets event comments by `getCommentTarget()` and a simple target/line key (`packages/renderer/src/panels/right/RightComments.tsx:223-265`). File comments need the same threading behavior but with a file-target key instead of an event-filename key.

Correction/gap: A plain `file_path::lines` key is not enough for diff hunk comments. Use `file_path::base::hunk` when hunk metadata exists, falling back to `file_path::lines` for ordinary line comments.

### B4. Card shape
Chosen: Add a dedicated `FileCommentCard` for feed activity, rather than extending `CommentActivityCard`.

Rationale: `EventCard` dispatches event-comment prose to `CommentActivityCard` today (`packages/renderer/src/cards/EventCard.tsx:95-105`). File comments need a path label, line/hunk label, and hunk snippet, while event comments resolve against feed anchors and existing prose cards.

Correction/gap: The right-panel thread card can share layout primitives, but the feed activity card should be separate to avoid teaching `CommentActivityCard` two unrelated target models.

### B5. Focus and scroll behavior
Chosen: Clicking a file comment opens the referenced file in the viewer and reveals the target line or hunk. If the file renderer cannot reveal a line, open the file and show the thread as focused with a best-effort path/line label.

Rationale: `openFile` already creates or activates a file tab (`packages/renderer/src/state/store.ts:1073-1110`), but renderers remount by path, so reveal state must live in the store as a pending target (`packages/renderer/src/panels/fileViewer/FileViewer.tsx:45-82`). Monaco can support `revealLine`, but the current wrapper does not expose an imperative handle yet (`packages/renderer/src/panels/fileViewer/renderers/MonacoRenderer.tsx:89-105`).

Correction/gap: In `/file-tree/:sessionId`, there is no feed anchor to scroll. The standalone page should open/reveal in its local viewer and keep comments in list mode; it should not try to align to `.feed-scroll`.

### B6. MCP support
Chosen: Yes, extend `fmark_post_prose` with the file-comment fields once the shared `PostProseBody` supports them.

Rationale: Agents should be able to answer and create discussions over file lines and hunks. The REST route already routes prose writes through the same event path (`packages/kernel/src/routes/events.ts:71-159`), and renderer comment flows already wake mentioned/targeted agents after comment writes (`packages/renderer/src/cards/LineCommentRail.tsx:660-677`, `packages/renderer/src/panels/right/RightComments.tsx:635-648`).

Correction/gap: Do this after B2, not before. If MCP accepts fields that the parser/serializer drop, agents will think they posted anchored comments while the event log has lost the anchor.

## C. Open In New Tab and `/file-tree`

### C1. Session/root switching fork
Chosen: (b) extend file text/content guards to accept a per-request root that is validated against known registered roots. Do not switch the global active path.

Rationale: The static server already serves arbitrary SPA paths (`packages/kernel/src/routes/static.ts:79-95`), and `GET /files/tree` already accepts a `root` query (`packages/kernel/src/routes/filesTree.ts:65-70`). The body routes are the blocker because `filesText` and `filesContent` guard against only the active project root (`packages/kernel/src/routes/filesText.ts:15-31`, `packages/kernel/src/routes/filesContent.ts:57-74`).

Correction/gap: Enumerate allowed roots from the same sources used by all-session listing: active path, `knownPaths`, favorites, registered project paths, and fallback (`packages/kernel/src/routes/sessions.ts:114-156`, `packages/kernel/src/state/store.ts:10-14`, `packages/kernel/src/paths/registry.ts:6-18`). For `/file-tree/:sessionId`, prefer resolving the session through `listAllSessions()` and its `path`/`path_id` fields (`packages/shared/src/sessions.ts:4-15`) rather than trusting an arbitrary client-provided root.

### C2. Store isolation
Chosen: Derive the initial session/root from the URL and suppress shared localStorage writes in the standalone surface. Any file tabs it writes should be in memory or under a route-specific namespace.

Rationale: `setCurrentSession` persists last-focused session by active path (`packages/renderer/src/state/store.ts:863-873`), and file viewer tabs/active file are persisted in shared session keys (`packages/renderer/src/state/store.ts:335-340`, `packages/renderer/src/state/store.ts:1089-1090`). A second tab using those same keys will bleed into the main app.

Correction/gap: Do not reuse the main `App` boot path unchanged. Add an explicit route mode or standalone entry component so normal app persistence stays intact while `/file-tree` stays read-mostly.

### C3. Route shape
Chosen: Use `/file-tree/:sessionId`, with auth token remaining in `?token=...`.

Rationale: The brief asks for a path param, and the existing SPA has no router; `main.tsx` just mounts `<App />` once (`packages/renderer/src/main.tsx:13-20`). A small `window.location.pathname` parser is enough for v1, and the existing token query reader already reads `?token=` (`packages/renderer/src/App.tsx:51-55`).

Correction/gap: Validate the session id against `listAllSessions()` on page load and show a local not-found state if it is missing or ambiguous across paths. Session ids can collide across project roots; `path_id` should disambiguate if that ever happens.

### C4. Standalone page scope
Chosen: The standalone page is for file browsing and viewing with ephemeral tabs. It should not write shared favorites, last-focused-session, or main-app file-tab persistence.

Rationale: The file tree and viewer are already store-driven (`packages/renderer/src/panels/right/RightFiles.tsx:15-263`, `packages/renderer/src/panels/fileViewer/FileViewer.tsx:31-101`), so reuse is viable once the store writes are isolated. Favorites are real project/session writes in `RightFiles` (`packages/renderer/src/panels/right/RightFiles.tsx:102-149`), and they are not needed to satisfy "open in a new tab."

Correction/gap: File-comment writes are not the same category as UI persistence. If B2 has already shipped, allow posting file comments from the standalone page because that writes to the selected session's event log; otherwise keep `/file-tree` read-only for the first slice.

## D. Configurable Layout

### D1. Scope
Chosen: Global user setting, localStorage-backed, live-applied, defaulting to the current layout.

Rationale: Theme and density already use the global localStorage plus live subscriber pattern and are applied before first render (`packages/renderer/src/main.tsx:8-11`, `packages/renderer/src/themes/index.ts:165-184`, `packages/renderer/src/themes/density.ts:64-82`). Appearance settings already subscribe and apply live (`packages/renderer/src/modals/settings/Appearance.tsx:135-158`).

Correction/gap: Do not make pane placement per-session or per-project in v1. Pane widths are per-session, but pane order is a preference like theme/density.

### D2. Picker fidelity
Chosen: Support only the six horizontal permutations of `{left-panel, chat, right-panel}` in v1 using CSS grid areas. Defer vertical, stacked, and 2D layout.

Rationale: The shell is currently a single-row grid with fixed columns (`packages/renderer/src/shell/shell.css:11-25`), and `App` renders the base regions in a fixed order (`packages/renderer/src/App.tsx:533-558`). Grid areas can solve horizontal placement without rearchitecting feed, compose, file viewer, and right-panel scroll ownership.

Correction/gap: The phrase "wherever the user likes" is too broad for v1. A true 2D picker would require a larger shell model, new responsive behavior, and conflict rules for compose/right-panel scrolling.

### D3. LeftRail behavior
Chosen: Keep the 48px `LeftRail` pinned to the physical left edge. Only the `LeftPanel`, chat, and `RightPanel` participate in placement.

Rationale: `LeftRail` is separate from `LeftPanel` in the App source (`packages/renderer/src/App.tsx:538-539`) and behaves like primary app navigation, not a content pane. Moving it with the left panel would make global navigation jump around.

Correction/gap: The picker labels should make this explicit: "Left pane" means the session/path panel, not the icon rail.

### D4. Resizer contract
Chosen: Make `PaneResizer` layout-aware by pane identity plus physical edge/growth direction, not by the current hard-coded `side` prop.

Rationale: Today `side="right"` mutates left-panel width and `side="left"` mutates right-panel width (`packages/renderer/src/components/PaneResizer.tsx:23-29`), and the drag math assumes fixed physical placement (`packages/renderer/src/components/PaneResizer.tsx:50-59`). Once panes can move, width ownership and drag direction must be derived from the pane's current slot.

Correction/gap: Keep width maps by pane identity and session. Only the handle edge and sign should vary with layout.

### D5. Precedence with file-viewer layouts and `/file-tree`
Chosen: Pane placement governs the three base regions. File-viewer replace/lower modes operate inside the chat slot; modal floats above placement; extra-pane mode adds an explicit `extra` grid area adjacent to the chat slot. `/file-tree` uses its own standalone layout and ignores base pane placement.

Rationale: App currently mounts replace-chat inside `.feed-col`, mounts lower mode inside `RightFiles`, and inserts extra-pane as a separate column before `RightPanel` (`packages/renderer/src/App.tsx:543-557`, `packages/renderer/src/panels/right/RightFiles.tsx:238-250`). CSS grid areas can preserve those ownership boundaries while allowing base panes to move.

Correction/gap: The existing source-order extra column will be wrong once `RightPanel` is not physically right of chat. Add an explicit `extra` grid area whenever `has-extra-pane` is active.

## E. Cross-cutting

### E1. Phasing and sequencing
Chosen build order:

1. Layout preference: independent, renderer-only except localStorage helpers. Ship horizontal permutations first.
2. `/file-tree/:sessionId`: add route-mode parsing, session/root resolution, per-request known-root guards for file body reads, and isolated/ephemeral viewer state.
3. File-comment prose contract: shared types/roles, kernel validation/parser/serializer/schema, renderer grouping/cards/store target, and MCP field support.
4. Read-only git diff: git service/route, changed-files list, per-file unified diff, parsed hunks, branch/session mode filtering.
5. Hunk actions: comment-on-hunk using file-comment fields, then revert-hunk with conflict handling and diff refresh.

Rationale: Feature 2 is a prerequisite for feature 1's "comment on hunk." Feature 3 is mostly independent but needs the same session/root discipline that diff and file comments also rely on. Feature 4 is independent and low coupling.

Correction/gap: Rebuild shared before typechecking kernel/renderer whenever `PostProseBody`, `ProsePayload`, or prose roles change.

### E2. Biggest risks and underestimated work
Chosen risk list:

- "Current session diff" is not exact without a session start snapshot. The hybrid design is honest and useful, but not complete.
- Hunk revert is the sharpest backend operation. It must use `git apply --reverse --check` before applying, refresh the diff after success, and return a clear conflict response on stale hunks.
- Root validation for `/file-tree` is security-sensitive. Current tree reads allow arbitrary absolute roots, while text/content are active-root-only; the new middle ground must allow only known registered project roots.
- File-comment persistence will fail silently or hard unless every allowlist is updated together: shared types, role classifier, blocks helper, kernel parser/serializer, validator, route schema, API client, MCP tool.
- Store isolation is easy to underestimate because current store actions persist session focus and file tabs as side effects.
- Deleted, renamed, untracked, and binary files need explicit diff states. Do not let them fall into a normal text-file path and crash the viewer.

Correction/gap: The architecture map is materially correct. The main additions are: static fallback needs `/git` as an API prefix; file comments need validator changes beyond a new role; and `/file-tree` can use all-scope session `path` metadata that already exists.

### E3. Things to cut from v1
Chosen cuts:

- No git snapshot/stash/worktree mutation at session create.
- No non-git tool-use replay fallback for session diff.
- No vertical/stacked pane layout.
- No office/binary/image diff bodies; badges only.
- No persisted standalone `/file-tree` tabs, favorites, or last-focused-session writes.
- No settings UI for branch base override in the first slice; support an API/config escape hatch only.
- No attempt to make Monaco's visual hunks the source of truth for revert/comment actions.
- No cross-tab synchronization beyond avoiding shared-state clobbering.
- No automatic line-drift repair beyond displaying stored hunk context and advisory current-line reveal.

Correction/gap: Do not cut file-comment schema if implementing hunk comments. It is the contract that makes hunk discussion durable.

## Recommended Phase Plan

Phase 1: Ship configurable layout as a self-contained renderer change. Add a layout preference module modeled on theme/density, CSS grid areas for the six horizontal permutations, a compact orientation picker in Appearance, and a resizer API based on pane identity plus physical edge.

Phase 2: Ship `/file-tree/:sessionId` as a standalone read-mostly browser. Use `listAllSessions()` to resolve `sessionId -> path/path_id`, extend file text/content reads with validated known-root support, and use isolated ephemeral viewer state.

Phase 3: Ship file comments end to end. Add the `file-comment` prose role and target helpers first, then renderer grouping/cards/focus, then MCP. Keep line reveal best-effort and use stored hunk snippets for stable context.

Phase 4: Ship read-only diffs. Add the git service and route, default-branch detection, session-touched file filtering, and per-file server hunks. Show branch/session/none modes but do not enable revert until hunk validation is solid.

Phase 5: Ship hunk actions. Add comment-on-hunk through file comments, then revert-hunk using reverse apply checks, conflict responses, and immediate diff refresh.

## Things To Cut For V1

Cut anything that creates a second source of truth: git snapshots, tool replay diffs, Monaco-owned hunk actions, and standalone-tab persistence. Cut broad layout freedom beyond horizontal permutations. Cut binary/office diff bodies. Cut polished branch-base settings UI, cross-tab sync, and automatic line drift repair. Keep the work boring where correctness matters: known-root guards, shared prose contracts, server hunks, and explicit conflict responses.

The most important thing not to get wrong: `append_to` remains an event-filename relationship, while file comments and git hunks need a separate file-target prose contract; do not overload the existing comment target shape. The second most important thing is to keep git hunks authoritative for actions and root/session state authoritative for file reads. Everything else can be phased, but those ownership boundaries need to be right from the first implementation.

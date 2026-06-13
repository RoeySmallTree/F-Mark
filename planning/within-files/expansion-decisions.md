# Within Files Expansion Decisions

Status: decisive override for the full-scope build. The owner instruction is "no deferrals, no legacy/back-compat" (`planning/within-files/consult-expansion.md:3-6`). Treat this file as the implementation contract over the older v1 cuts in the spec.

## X1. Full Pane Placement

Verdict: use a generated CSS grid-area placement model, not nested split-pane DOM. The current shell is already a grid with fixed source order (`packages/renderer/src/shell/shell.css:11-25`) and `App` renders the rail, left panel, chat, extra pane, and right panel in one place (`packages/renderer/src/App.tsx:533-558`). Keep that ownership, but replace positional columns with named areas.

Do not ship only six horizontal permutations. The placement model is the 36 legal guillotine arrangements of the three movable panes:

```ts
type PaneId = "leftPanel" | "chat" | "rightPanel";

type ShellPlacement =
  | { kind: "columns"; slots: [PaneId, PaneId, PaneId] }
  | { kind: "rows"; slots: [PaneId, PaneId, PaneId] }
  | { kind: "side-stack"; side: "left" | "right"; full: PaneId; stack: [PaneId, PaneId] }
  | { kind: "band-split"; band: "top" | "bottom"; full: PaneId; split: [PaneId, PaneId] };
```

This gives: 6 column layouts, 6 row layouts, 12 side-stack layouts, and 12 top/bottom band-split layouts. It covers vertical stacking and mixed side-by-side plus stacked arrangements without arbitrary overlapping cells or a new shell renderer.

Grid contract:

- `.main` remains the single shell owner, but gets `grid-template-areas` generated from the active `ShellPlacement`.
- `.left-rail` gets `grid-area: rail` and a fixed 48px rail track. It never moves because it is primary navigation (`packages/renderer/src/shell/LeftRail.tsx:25-33`, `packages/renderer/src/shell/shell.css:999-1008`).
- `.left-panel-host`, `.feed-col`, `.right-panel`, and `.fv-extra-pane` get stable grid areas: `leftPanel`, `chat`, `rightPanel`, and `extra`.
- `LeftPanel` and `RightPanel` must stop owning only inline `width`; they should accept layout geometry from the shell. Today the left host owns width and always places the resizer on the right (`packages/renderer/src/shell/LeftPanel.tsx:21-49`), and the right panel owns width with the resizer on the left (`packages/renderer/src/shell/RightPanel.tsx:186-193`). In the new model, grid tracks own width/height, and the pane components only render contents plus the resizer.

Concrete area examples:

```css
/* columns: leftPanel | chat | rightPanel */
.main[data-shell-layout="columns:leftPanel-chat-rightPanel"] {
  grid-template-columns: 48px var(--left-panel-w) minmax(0, 1fr) var(--right-panel-w);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: "rail leftPanel chat rightPanel";
}

/* rows: leftPanel over chat over rightPanel */
.main[data-shell-layout="rows:leftPanel-chat-rightPanel"] {
  grid-template-columns: 48px minmax(0, 1fr);
  grid-template-rows: var(--left-panel-h) minmax(0, 1fr) var(--right-panel-h);
  grid-template-areas:
    "rail leftPanel"
    "rail chat"
    "rail rightPanel";
}

/* side stack: full-height leftPanel, chat over rightPanel */
.main[data-shell-layout="side-stack:left:leftPanel:chat-rightPanel"] {
  grid-template-columns: 48px var(--left-panel-w) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) var(--right-panel-h);
  grid-template-areas:
    "rail leftPanel chat"
    "rail leftPanel rightPanel";
}

/* band split: full-width chat on top, leftPanel | rightPanel below */
.main[data-shell-layout="band-split:top:chat:leftPanel-rightPanel"] {
  grid-template-columns: 48px var(--left-panel-w) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) var(--right-panel-h);
  grid-template-areas:
    "rail chat chat"
    "rail leftPanel rightPanel";
}
```

The layout module must generate the real CSS/data key from the placement object instead of hand-authoring all 36 selectors. The generator rule is: any column or row touched by `chat` uses `minmax(0, 1fr)` unless `chat` spans it only as part of a larger rectangle; non-chat side tracks use the pane's persisted width or height. Chat scroll ownership stays inside `.feed-col`, which already owns feed plus compose and uses `min-height: 0`, `min-width: 0`, `overflow: hidden`, and column flex (`packages/renderer/src/shell/shell.css:26-35`).

Resizers:

- Replace `PaneResizer({ side })` with `PaneResizer({ pane, axis, edge, sign })`. The current `side` prop hard-codes both store map and drag sign (`packages/renderer/src/components/PaneResizer.tsx:18-29`, `packages/renderer/src/components/PaneResizer.tsx:54-63`).
- Keep width maps keyed by pane identity, not physical side. Add height maps keyed by session and pane identity: `panelSizeBySession[sessionId].leftPanel.{width,height}` and same for `rightPanel`. The old width maps can migrate into the new shape once, then be deleted.
- Horizontal edges use `col-resize`; vertical edges use `row-resize`. A pane only renders the resizer on the edge that borders a flexible/chat track or another pane track. Do not render a resizer against the rail or viewport edge.

File-viewer shell composition:

- `replace-chat` stays inside the `chat` area because `ReplaceChatShell` already occupies `.feed-col` (`packages/renderer/src/panels/fileViewer/shells/ReplaceChatShell.tsx:8-37`).
- `lower` stays inside `RightFiles`; it is a vertical split owned by the Files tab (`packages/renderer/src/panels/right/RightFiles.tsx:151-163`, `packages/renderer/src/panels/right/RightFiles.tsx:238-250`).
- `modal` remains an overlay independent of placement (`packages/renderer/src/panels/fileViewer/shells/ModalShell.tsx:33-60`).
- `extra` becomes a satellite of the `chat` area. The old extra pane assumes it sits between chat and the right panel (`packages/renderer/src/panels/fileViewer/shells/ExtraPaneShell.tsx:9-11`) with a left-edge resizer (`packages/renderer/src/panels/fileViewer/shells/ExtraPaneShell.tsx:22-35`) and a right-positioned collapsed button (`packages/renderer/src/panels/fileViewer/fileViewer.css:402-423`). Replace that with generated `extra` placement:
  - If the chat rectangle has a horizontal edge available, split the chat rectangle into `chat` plus `extra`; put `extra` on the edge closest to the physical right, or on the left if chat is already rightmost.
  - If chat is in a top/bottom band and horizontal split would crush content, split vertically; put `extra` below chat unless chat is bottommost, then above.
  - `ExtraPaneShell` receives `{ axis, edge, sign }` and uses width for horizontal extra, height for vertical extra.
  - Collapsed extra button receives `data-edge="left|right|top|bottom"` and positions from the derived edge, never from `--right-panel-w`.

Picker UI:

- Add "Pane arrangement" to Appearance, next to the existing theme/density live settings pattern (`packages/renderer/src/modals/settings/Appearance.tsx:135-158`, `packages/renderer/src/modals/settings/Appearance.tsx:160-220`).
- The picker is not a list of 36 text buttons. It has a split-pattern selector (`Columns`, `Rows`, `Side stack`, `Top/bottom split`) and three draggable or click-assign pane tokens (`Left pane`, `Chat`, `Right pane`) in the diagram regions. Each pane must be used exactly once.
- Persist globally as a product preference, like theme/density, under `fmark.shellPlacement`. Pane sizes remain per session because the existing panel widths are session-scoped (`packages/renderer/src/state/store.ts:660-664`).
- Labels must say "Left pane", not "Left rail"; the rail is pinned.

Landmines:

- CSS source order can no longer imply physical order. Every border side, resizer edge, and collapsed button edge must derive from placement.
- Vertical placements need panel heights. Reusing width-only maps will make row layouts unusable.
- Extra-pane vertical mode must not assume `col-resize`.
- The right panel has fixed border-left CSS today (`packages/renderer/src/shell/shell.css:1566-1573`); border side must become placement-derived.

## X2. Root-Scoped Event Write, Read, Publish, and Wake

Verdict: delete the active-root event contract. Every event read/write/wake that can target session data must carry a required root scope. No "when absent, use active root" fallback.

Use one shared scope type:

```ts
type RootScope =
  | { path_id: string; root?: never }
  | { root: string; path_id?: string };

interface KnownRoot {
  root: string;
  path_id: string;
  paths: Paths;
  is_active: boolean;
  revision?: number;
}
```

Add `listKnownRoots(deps)` and `resolveKnownRootScope(deps, scope)`. The source set must match all-session enumeration: active context root, persisted active path, known paths, favorites, registered project paths, and fallback (`packages/kernel/src/routes/sessions.ts:120-134`, `packages/kernel/src/state/store.ts:10-14`, `packages/kernel/src/paths/registry.ts:16-39`). If both `root` and `path_id` are supplied, they must resolve to the same known root. Missing scope is `400 ROOT_SCOPE_REQUIRED`; unknown scope is `404 UNKNOWN_ROOT`.

Routes and shapes:

- `GET /sessions/:id/events?path_id=<id>` or `?root=<root>`: delete `path`. Current code trusts arbitrary `path` and calls `makePaths(req.query.path)` (`packages/kernel/src/routes/events.ts:673-686`); replace that with `resolveKnownRootScope` and `known.paths`.
- `POST /sessions/:id/events/prose`: body requires `path_id` or `root`. Delete body `path` and delete legacy `target`. Current prose writes run `checkPathAgainstActive` and then `resolvePaths(deps)` (`packages/kernel/src/routes/events.ts:141-152`).
- Apply the same required scope to every event POST in `routes/events.ts`, not only prose. The file has multiple active-root event writers and body `path` schemas (`packages/kernel/src/routes/events.ts:193`, `packages/kernel/src/routes/events.ts:283`, `packages/kernel/src/routes/events.ts:369`, `packages/kernel/src/routes/events.ts:650`).
- Event-producing sibling routes (`files`, `todos`, `html`, `flow`) should use the same helper before the feature is considered complete, because they publish writes through the same event service and bus.
- `POST /sessions/:id/wake`: body requires `path_id` or `root`, alongside `target_participant_ids`, `reason`, and `source_event`. Current wake resolves `routePaths()` from the active path (`packages/kernel/src/routes/managedAgents.ts:1601-1604`) and then reads inbox from that path (`packages/kernel/src/routes/managedAgents.ts:1663-1669`).

Stale-path guard:

- Delete `checkPathAgainstActive` and the `quietCrossPathHooks` escape hatch from this path. The current guard exists to reject non-active hook paths (`packages/kernel/src/routes/stalePath.ts:5-14`, `packages/kernel/src/routes/stalePath.ts:27-72`). With required known-root scope, background roots are valid if known and invalid if unknown.
- Update hooks to send `root` or `path_id` explicitly. Do not keep `path` as a deprecated alias.

Path resolution:

- Replace every `resolvePaths(deps)` in scoped handlers with `known.paths`, which is `makePaths(known.root)`. The helper in `pathDeps.ts` currently falls back to active or fallback paths (`packages/kernel/src/routes/pathDeps.ts:26-35`); scoped routes must not call it after scope resolution.
- `ensureSession` must check the session under `known.paths`, so the same session id can exist under another root without ambiguity.

Publish and WS behavior:

- `publishEventWrites` must accept a scope envelope: `{ pathId: known.path_id, revision: known.revision }`.
- For background roots, publish `pathId` and no active revision. The bus wrapper currently preserves a publisher-set `pathId` but still injects active `revision` when omitted (`packages/kernel/src/ws/envelope.ts:19-23`), which would create mixed envelopes. Change the wrapper rule: if `message.pathId` is already set, do not inject active revision unless the publisher also asks for it.
- Main app filtering by `pathId` already drops non-active events (`packages/renderer/src/App.tsx:369-382`). A standalone `/file-tree` tab should keep its own selected `path_id` and accept messages for that path instead of using active path state.

Wake and presence:

- Add `createAgentStateStoreForRoot(root, globalPaths)` or equivalent. `createAgentStateStore` currently binds to active path state (`packages/kernel/src/services/agentState.ts:292-305`), and `managedAgents.ts` creates state from the active path (`packages/kernel/src/routes/managedAgents.ts:647-655`).
- Tmux liveness must be root-scoped. Current wake calls `tmux.listFmarkSessions()` from a manager scoped to active project (`packages/kernel/src/routes/managedAgents.ts:1612-1614`). Add a root parameter or list all F-Mark tmux sessions and filter by the `@fmark-project` option.
- Presence messages for a background wake should publish with the same `pathId` envelope so active tabs ignore them and matching standalone tabs can update.

Client changes:

```ts
type ClientRootScope = { pathId: string } | { root: string };

listEvents(sessionId, params: EventListParams & { root: ClientRootScope }): Promise<AnyEventRecord[]>
postProse(sessionId, body: PostProseBody & { root: ClientRootScope }): Promise<{ filename: string }>
wakeSession(sessionId, req: WakeSessionRequest & { root: ClientRootScope }): Promise<WakeSessionResponse>
```

Every caller must pass scope:

- `App.tsx` initial event load and WS refresh (`packages/renderer/src/App.tsx:276-278`, `packages/renderer/src/App.tsx:418-420`).
- `Compose.tsx` post and wake paths (`packages/renderer/src/compose/Compose.tsx:328`, `packages/renderer/src/compose/Compose.tsx:350-355`, `packages/renderer/src/compose/Compose.tsx:404`).
- `LineCommentRail.tsx` comment post, wake, and refresh (`packages/renderer/src/cards/LineCommentRail.tsx:660-679`).
- `RightComments.tsx` refresh, post, and wake (`packages/renderer/src/panels/right/RightComments.tsx:594`, `packages/renderer/src/panels/right/RightComments.tsx:635-644`).
- `CommentThreadOverlay.tsx` post/resolve flows and refreshes (`packages/renderer/src/overlays/CommentThreadOverlay.tsx:287-332`).
- Todo wake call sites (`packages/renderer/src/compose/CreateTodoPopover.tsx:167`, `packages/renderer/src/cards/TodoCard.tsx:146`, `packages/renderer/src/panels/TodoTreeList.tsx:305`).

Correctness pitfalls:

- A background root might not have an active file watcher. Event writes are still durable and should publish WS; file-change-driven diff refresh is best effort until a watcher exists for that root.
- Session ids are not globally unique. Always use `(path_id, sessionId)` for standalone state and event reads (`packages/shared/src/sessions.ts:4-15`).
- If a background root has no live managed agents, posting the comment succeeds and wake returns skipped agents. Do not roll back the event.

## X3. Complete Hunk Revert Matrix

Verdict: every status has a real action. Server hunks remain authoritative; Monaco never computes action hunks (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:48-50`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:361-363`).

General endpoint:

```ts
POST /git/revert-hunk
{
  path_id: string,
  rel_path: string,
  mode: "current-session" | "whole-branch",
  base_ref?: string,
  hunk_id: string,
  action?: "hunk" | "file" | "rename"
}
```

The server recomputes the diff for `(path_id, rel_path, mode, base_ref)`, finds the matching hunk by id, writes a temporary single-hunk patch, then runs a dry check before applying. Do not trust patch text from the browser.

Text hunk operation:

```bash
git -C <root> apply --reverse --check --recount <patchfile>
git -C <root> apply --reverse --recount <patchfile>
```

Use `--index` only when the hunk is explicitly an index/staged hunk. Otherwise do not stage changes. If porcelain says the file was staged-only and the apply changed the worktree, update the index for that path after a successful revert so the staged view does not lie:

```bash
git -C <root> add -A -- <rel_path>
```

Status matrix:

| Status | Diff body | Hunk revert | Whole-file revert |
|---|---|---|---|
| modified text | Server unified hunks. | Reverse-apply selected hunk to worktree. | `git -C <root> restore --source=<base_tree> --worktree -- <rel_path>`. |
| staged modified text | Server hunks tagged with index/worktree origin. | For index hunk: `git apply --reverse --cached --check`, then `git apply --reverse --cached`; for worktree hunk: normal worktree apply. | `git restore --source=<base_tree> --staged --worktree -- <rel_path>`. |
| untracked text | Synthesize new-file diff from `/dev/null`; include every text hunk. | Reverse-apply the selected synthetic hunk to the file. If the file becomes empty, unlink it. | `rm -- <abs_path>` after verifying it is inside root and untracked. |
| added unstaged text | Same as untracked if not in index. | Same as untracked. | `rm -- <abs_path>`. |
| added staged text | New-file diff from `/dev/null`, tagged staged. | Reverse-apply selected hunk. If any content remains, `git add -- <rel_path>` to keep the staged added file matching worktree. If no content remains, `git rm --cached -f -- <rel_path>` then unlink empty file. | `git rm -f -- <rel_path>`. |
| deleted text | Reverse diff with empty working side. | Reverse-apply selected deletion hunk. This may recreate a partial file containing the restored hunk plus context. | `git restore --source=<base_tree> --worktree -- <rel_path>`; add `--staged` if deletion is staged. |
| renamed text, no content change | Rename metadata only. | No text hunk exists; expose `action:"rename"`. | `git mv -- <new_rel_path> <old_rel_path>` when tracked, else `mv`. If staged, follow with `git add -A -- <old_rel_path> <new_rel_path>`. |
| renamed text with content changes | Rename metadata plus hunks on destination path. | Content hunks reverse-apply to the destination path. Rename action separately moves the file back. | Restore old path from base and remove new path: `git restore --source=<base_tree> --worktree -- <old_rel_path>` then `git rm -f -- <new_rel_path>` or `rm -- <new_abs_path>` if untracked. |
| binary modified | Binary diff body, no text hunks. | `action:"file"` only. | `git restore --source=<base_tree> --worktree -- <rel_path>`. |
| binary added or untracked | Binary diff body, no text hunks. | `action:"file"` only. | Staged: `git rm -f -- <rel_path>`; untracked: `rm -- <abs_path>`. |
| binary deleted | Binary diff body, no text hunks. | `action:"file"` only. | `git restore --source=<base_tree> --worktree -- <rel_path>`; add `--staged` if staged. |
| binary renamed | Binary diff body with old/new paths. | `action:"rename"` or `action:"file"`. | Same rename/full-file operations as text rename, with no text hunk apply. |

Binary does not get fake line hunks. The "hunk action" surface becomes a file-level revert button for binary statuses, because there is no meaningful per-line hunk. That still satisfies the full-scope requirement: binary can be reverted, not merely badged.

Landmines:

- `git diff` alone will not include untracked files. The changed-files endpoint must union `git diff` with `git ls-files --others --exclude-standard` as already noted by the spec review (`planning/within-files/spec-review.md:77-83`).
- Rename reverts need both paths in the hunk metadata. A `rel_path` alone is insufficient.
- Partial revert for deleted files can create a partial file. The UI label must say "Restore hunk", not "Restore file".
- Never run shell strings. Use spawn args, and always revalidate `rel_path` under the known root before file deletion.

## X4. Delete Legacy Contracts and Require Root Scope for File Reads

### X4a. Legacy prose `target`

Confirmed: the legacy `target: { file, lines }` shape still exists.

- Shared type: `ProseTarget` and deprecated `ProseFrontmatter.target` (`packages/shared/src/events.ts:17-20`, `packages/shared/src/events.ts:54-56`).
- REST schema and route body: `ProseBody.target` and `target` schema (`packages/kernel/src/routes/events.ts:35-43`, `packages/kernel/src/routes/events.ts:99-112`).
- Write normalizer: `normaliseProseBody` maps `target` to `append_to`/`mode`/`lines` (`packages/kernel/src/services/events.ts:53-58`, `packages/kernel/src/services/events.ts:131-158`).
- Parser back-compat: `parseProse` maps legacy target on read (`packages/kernel/src/events/prose.ts:31-37`, `packages/kernel/src/events/prose.ts:83-116`).
- Role classifier: `getProseRole` maps `payload.target` to comment (`packages/shared/src/proseRoles.ts:1-5`, `packages/shared/src/proseRoles.ts:30-56`).
- Validator still knows `target` as a legacy key (`packages/kernel/src/events/proseValidate.ts:8-22`, `packages/kernel/src/events/proseValidate.ts:60-84`).

Local event-log scan result: no `.prose.md` files under this checkout, including hidden `.f-mark` folders, matched `target:` frontmatter. Still do a one-time migration, not an accepted break:

1. Add a migration command or boot migration over every known root/session prose file.
2. If a file has `target` and no new fields, rewrite frontmatter to `append_to`, `mode: "comment"`, and optional `lines`, then remove `target`.
3. If a file has both `target` and new fields, fail the migration with a path/filename report. Do not silently prefer one shape.
4. After migration lands, delete `ProseTarget`, all `target` schema entries, `normaliseProseBody`, the parser branch, the classifier branch, and validator target rules.
5. Add tests proving `target` is rejected on write and ignored nowhere on read.

### X4b. Required root scope for file read APIs

Verdict: delete absolute-path-only active-root reads. File APIs require root scope and root-relative paths.

New client shape:

```ts
type RootScope = { pathId: string } | { root: string };

fetchFilesTree(scope: RootScope): Promise<FilesTreeResponse>;
fetchFileText(scope: RootScope, relPath: string, maxBytes?: number): Promise<FileTextResponse>;
fileContentUrl(scope: RootScope, relPath: string): string;
```

New route shape:

- `GET /files/tree?path_id=<id>` or `?root=<known-root>`.
- `GET /files/text?path_id=<id>&rel_path=<path>&maxBytes=<n>`.
- `GET /files/content?path_id=<id>&rel_path=<path>`.

Delete the old `path` query from `/files/text` and `/files/content`. Those routes currently read `path` and guard against active root only (`packages/kernel/src/routes/filesText.ts:40-48`, `packages/kernel/src/routes/filesContent.ts:82-90`). Delete arbitrary-root tree browsing too; `/files/tree` currently accepts `root` and passes it to `resolveBrowsePath` without known-root validation (`packages/kernel/src/routes/filesTree.ts:65-70`).

Every caller to change:

- Client interface and implementation (`packages/renderer/src/api/client.ts:156`, `packages/renderer/src/api/client.ts:174-176`, `packages/renderer/src/api/client.ts:368-407`).
- Files tree loader (`packages/renderer/src/panels/right/files/filesTreeLoader.ts:10-30`).
- Files preloader and files.changed refresh (`packages/renderer/src/panels/right/files/FilesTreePreloader.tsx:14-17`, `packages/renderer/src/App.tsx:400-405`).
- FileViewer renderer dispatch must pass root scope and convert abs path to root-relative path (`packages/renderer/src/panels/fileViewer/FileViewer.tsx:59-80`).
- Text readers: Markdown, CSV, Monaco (`packages/renderer/src/panels/fileViewer/renderers/MarkdownRenderer.tsx:50-53`, `packages/renderer/src/panels/fileViewer/renderers/CsvRenderer.tsx:34-36`, `packages/renderer/src/panels/fileViewer/renderers/MonacoRenderer.tsx:55-57`).
- Content URL readers: binary, image, audio, video, office (`packages/renderer/src/panels/fileViewer/renderers/BinaryFallbackRenderer.tsx:23-29`, `packages/renderer/src/panels/fileViewer/renderers/ImageRenderer.tsx:10-17`, `packages/renderer/src/panels/fileViewer/renderers/AudioRenderer.tsx:9-16`, `packages/renderer/src/panels/fileViewer/renderers/VideoRenderer.tsx:9-16`, `packages/renderer/src/panels/fileViewer/renderers/OfficeRenderer.tsx:20-29`).

Renderer rule: keep absolute paths as UI/tab identifiers for now because `FileViewer` and `FileRow` already work that way (`planning/within-files/spec-review.md:45-51`), but all server calls must convert with `toRootRelative(root, absPath)` before hitting the API. Standalone `/file-tree` uses its selected root, not active store root.

Landmine: `fileContentUrl` is used in raw browser media tags, so auth token plus `path_id`/`rel_path` must be encoded in a URL, not a JSON body.

## X5. Base-Ref Override Settings

Verdict: add a first-class Settings section named `Git/Diff`. Do not hide this in the file-viewer toolbar only.

Why settings: base-ref override is project behavior, not a per-tab visual toggle. File-viewer layout is already per-project in localStorage (`packages/renderer/src/state/store.ts:335-344`, `packages/renderer/src/state/store.ts:695-704`, `packages/renderer/src/state/store.ts:1185-1203`), but diff base affects kernel git endpoints, standalone tabs, and all renderer tabs. The authoritative store should be the project config, not localStorage. `ProjectConfig` currently has version, port, and participants only (`packages/kernel/src/project.ts:9-13`) with read/write helpers (`packages/kernel/src/project.ts:78-83`); add:

```ts
interface ProjectConfig {
  version: string;
  port: number;
  participants: Record<string, Participant>;
  git?: {
    diff_base_ref_override?: string | null;
  };
}
```

Renderer cache:

```ts
gitDiffSettingsByPathId: Record<string, {
  baseRefOverride: string | null;
  detectedBaseRef: string | null;
  effectiveBaseRef: string | null;
  mergeBaseSha: string | null;
  status: "ok" | "not-git" | "base-not-found";
}>;
```

Settings UI:

- Add `"git-diff"` to `SettingsSectionKey` (`packages/renderer/src/state/store.ts:88-95`).
- Add a `Git/Diff` side-nav item to `SettingsModal` (`packages/renderer/src/modals/settings/SettingsModal.tsx:45-53`) and render the new panel next to the other sections (`packages/renderer/src/modals/settings/SettingsModal.tsx:262-285`).
- Panel fields: current project label, detected default base, effective merge-base sha, text input for override, Validate, Save, Clear.
- The file-viewer diff toolbar should show the effective base ref and a gear icon that calls `openSettings("git-diff")`. `openSettings(section)` already supports a target section (`packages/renderer/src/state/store.ts:1021-1023`).

API shape:

```ts
GET /git/diff-settings?path_id=<id>
PUT /git/diff-settings
{
  "path_id": "<id>",
  "diff_base_ref_override": "origin/main" | null
}
```

Response:

```ts
{
  "path_id": "<id>",
  "root": "/repo",
  "diff_base_ref_override": "origin/main" | null,
  "detected_base_ref": "origin/main" | null,
  "effective_base_ref": "origin/main" | null,
  "merge_base_sha": "abc123" | null,
  "status": "ok" | "not-git" | "base-not-found",
  "error": "..." | null
}
```

Validation:

- `path_id` is required and resolved through known roots.
- Override is trimmed. Empty string means clear.
- Validate with `git check-ref-format --allow-onelevel` and `git rev-parse --verify <ref>^{commit}` using spawn args.
- Diff endpoints default to the saved effective base. They may accept an explicit `base_ref` for preview, but it must go through the same validation and must not be the only way to configure the app.

Landmine: storing this only in renderer localStorage would make `/file-tree`, MCP, and direct git endpoints disagree with the visible setting.

## X6. Sweep of Former Cuts and Deferred Items

Each old non-goal/deferred item is resolved here:

- Git snapshot/stash/worktree mutation at session creation (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:29`): still out, by design. This was a rejected implementation strategy, not a user requirement. It mutates or snapshots the project at the wrong lifecycle point. Keep the derived git model.
- Tool-use replay fallback for non-git projects (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:30`): still out, by design. It is lossy and not a git diff. File comments remain available in non-git roots; diff modes report `not-git`.
- Vertical/stacked/free-2D layout (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:31`): in scope via X1's 36 generated placements.
- Binary/image/audio/video/office diff body (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:32`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:324-336`): in scope. Add `GET /git/blob-version?path_id=&rel_path=&version=base|working&mode=&base_ref=` for streaming base/working binary blobs. Images show before/after previews with dimensions and byte sizes. Audio/video show before/after players when both versions exist. Office and unknown binary show metadata plus download/open controls. Binary revert is file-level per X3.
- `/file-tree` comment posting (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:33-35`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:392-396`): in scope via X2. Standalone posting writes to the selected root/session and wakes scoped agents.
- Persisted standalone-tab state (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:36`): in scope, but namespaced. Add `fmark.fileTreePage.v1` keyed by `(path_id, sessionId)` for selected session, open tabs, active file, diff state, and last focused file. Do not write main-app keys such as `fileViewerTabsBySession`, because those currently persist shared tabs (`packages/renderer/src/state/store.ts:335-340`, `packages/renderer/src/state/store.ts:1089-1090`).
- Standalone favorites: in scope as real root-scoped file favorite writes. Extend `/files/favorites` to require root scope before enabling favorite actions in `/file-tree`.
- Base-ref settings UI (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:37`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:300-303`, `docs/superpowers/specs/2026-06-13-within-files-features-design.md:400-402`): in scope via X5.
- Monaco-computed hunks (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:38`): still out, by design. This is a rejected source of truth, not a deferred user feature. Monaco can render, but server git hunks own actions.
- Cross-tab state synchronization (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:39`): in scope where it matters. Use WS for events/file changes by `pathId`, `storage` events for saved settings/layout/base-ref, and a `BroadcastChannel("fmark:within-files")` for standalone tab state keyed by `(path_id, sessionId)`. Do not sync active project/session from standalone to main unless the user explicitly presses "Make active project".
- Automatic line-drift repair (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:40`): in scope. Extend file-comment payload with `line_context?: { selected: string; before?: string; after?: string; sha256: string }`. On reveal, first try stored `lines`, then exact selected text, then before/after context, then hunk snippet. If ambiguous, show candidates; if none, show stale context and do not jump.
- Picker labels/diagrams (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:398-400`): resolved by X1. The picker labels are `Columns`, `Rows`, `Side stack`, `Top/bottom split`, with pane tokens `Left pane`, `Chat`, `Right pane`.
- `/file-tree` "promote to active project" (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:402-403`): in scope as an explicit toolbar command, "Make active project". It calls the existing active path switch only after confirmation because it broadcasts `path-switched` to main tabs.

## X7. Final Build Order and Landmines

Build order:

1. Root-scope foundation: `listKnownRoots`, `resolveKnownRootScope`, required `path_id`/`root` shared types, WS envelope fix, and scoped agent-state/tmux helpers.
2. Delete legacy prose target: run one-time migration, remove `target` types/schema/parser/classifier/normalizer, and add tests that legacy target is gone.
3. Required file read scope: change `/files/tree`, `/files/text`, `/files/content`; update every client/caller listed in X4; add root-relative conversion.
4. File-comment contract: add `file_path`, `diff_hunk`, `diff_base`, `base_ref`, and `line_context`; update shared, kernel parser/serializer/validator, route schema, renderer grouping/cards, and MCP.
5. Standalone `/file-tree`: route with `(path_id, sessionId)`, scoped tree/text/content reads, namespaced persistence, scoped comments, scoped wake, scoped favorites, and optional "Make active project".
6. Git/Diff settings: project config field, `/git/diff-settings`, settings panel, file-viewer gear link, and effective base-ref plumbing.
7. Git read APIs: changed files, unified hunks, text file-version, binary blob-version, non-git state, static fallback `/git` prefix (`packages/kernel/src/routes/static.ts:50-62`).
8. Hunk and file revert: implement the X3 matrix, conflict responses, diff refresh, and binary/rename whole-file actions.
9. Full shell placement: generated 36-layout picker, grid-area CSS, placement-derived resizers/borders, extra-pane satellite placement, vertical size persistence.
10. Cross-tab and line-drift polish: BroadcastChannel/storage synchronization and fuzzy line repair UI.

Top landmines:

- X2 is security-sensitive. Never let `root` become arbitrary filesystem browsing; it must resolve through known roots every time.
- X2 can silently publish wrong WS envelopes if `pathId` is scoped but `revision` is still injected from the active path.
- X2 wake can read the wrong agents unless agent state and tmux liveness are root-scoped, not active-path scoped.
- X4 has no optional fallback. If a caller misses `path_id`, the correct result is a hard client/type failure or server `400`, not active-root behavior.
- X1 cannot rely on DOM order, old border sides, or old resizer signs. Every physical edge must be derived.
- X1 vertical layouts require height persistence. Width-only persistence is incomplete.
- X3 rename and deleted-file partial hunk reverts need old and new paths plus base tree info. A single `path` is not enough.
- Binary diff bodies need blob streaming with auth and range behavior, not `fetchFileText`.
- `packages/shared` must be rebuilt before typechecking kernel/renderer after shared event contracts change, as the spec already warns (`docs/superpowers/specs/2026-06-13-within-files-features-design.md:382-383`).

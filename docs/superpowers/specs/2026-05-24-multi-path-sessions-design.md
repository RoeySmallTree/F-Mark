# Multi-Path Sessions — Design Spec

> **Status:** post-/buddy merge. Pending user review.
> **Targets:** F-Mark v0.5 (post-tmux-orchestration). This spec sits on top of the v0.4 tmux work in `2026-05-23-tmux-agent-orchestration-design.md` — managed-agent state and tmux project-tagging move to a global, **`pathId`-partitioned** scheme introduced here, but the orchestration model itself is unchanged.

## Summary

Today the F-Mark kernel boots anchored to a single working directory (`process.cwd()`) and creates `.f-mark/` there automatically. All sessions, the auth token, the runtimes registry, participants, and managed-agent state share that one root. This change splits the model into:

1. **Global `~/.config/f-mark/`** — user/machine-level: auth token, active-path state, recents/favorites, default config, default runtimes, **project-partitioned** managed-agent state and per-project runtime overrides.
2. **Per-path `<picked-folder>/.f-mark/`** — project-level, created lazily: sessions, project-scoped participants, project `AGENT.md`. A path with no sessions has no `.f-mark/` at all.

Crucially, a **`pathId`** (truncated SHA-256 of the canonical absolute path) becomes a first-class identity key across the system. It appears in WebSocket messages, managed-agent state partitioning, tmux session tags (replacing the v0.4 raw-path tag), and hook POST bodies. This eliminates the same-`session_id` collision risk between projects and gives hooks a stable handle to address a project across kernel restarts.

The NewSessionModal is also trimmed: template/invite sections and both path display strings are removed, leaving two fields — Folder (picker) and Slug. The folder picker is an inline, kernel-served, native-feeling chooser with favorites.

## Goals

1. **No surprise filesystem writes.** Kernel boot never creates a project-level `.f-mark/`. The only auto-created directory at boot is `~/.config/f-mark/` (or `$XDG_CONFIG_HOME/f-mark/`).
2. **Explicit per-session folder choice.** Each session lives where the user said it should live.
3. **Multiple paths per kernel.** A single running kernel can be pointed at any folder. Switching paths refreshes sessions, watchers, the tmux project tag, and WebSocket subscriptions cleanly — without leaking events between projects.
4. **Identity is path-scoped.** Participants, agent active-session pointers, hook posts, WS messages, and renderer caches all include `pathId` (or equivalent path context). Same-named sessions in different paths never confuse anything.
5. **Favorites with custom names.** Users save frequently-used paths under human-readable names and switch by name from the topbar.
6. **Trimmed session-create UI.** Template and invite sections are removed; the path display is removed from input and footer; the slug input drops its prefix segment.

## Non-Goals

- **Multi-tab simultaneous paths.** One activePath per kernel. (Future work.)
- **Native OS folder dialog.** Browser, not Electron. The File System Access API doesn't expose absolute paths. We build a native-feeling inline picker.
- **Migration of existing `<cwd>/.f-mark/` data.** Clean slate confirmed by user; no auto-import of pre-existing dev sessions.
- **Per-path tokens.** One token, in `~/.config/f-mark/.token`. Single-user kernel.
- **Moving a project's folder while it has live managed agents.** A managed agent's state is keyed by the pathId of the folder it was spawned in; renaming/moving that folder orphans the agent state. Re-spawn is required after a move. (Documented; a re-bind tool is future work.)
- **Cross-machine sync of state.json.** Favorites/recents are per-machine.
- **Windows native paths.** WSL only, same as v0.4.

## Architecture Overview

### Path identity — `pathId`

```ts
// packages/kernel/src/paths/identity.ts
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

export function computePathId(absPath: string): string {
  const canonical = realpathSync(absPath); // throws ENOENT if path is gone
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}
```

- 48-bit truncation is acceptable: collision probability is negligible for a single user's path count (~hundreds at most).
- `pathId` is opaque to the user. The display identity is the absolute path string.
- A "path registry" file at `~/.config/f-mark/projects/<pathId>/path` holds the absolute path that produced this id (single line). This makes `pathId → absPath` lookup O(1) and enables a future "the folder moved" repair flow.

### Global tree — `~/.config/f-mark/` (respects `$XDG_CONFIG_HOME`)

```
~/.config/f-mark/
├── .token                      # auth token (one per user)
├── state.json                  # { activePath, activeRevision, knownPaths[], favorites[] }
├── config.json                 # global defaults: { version, port, host }
├── runtimes.json               # default runtime catalog (fallback)
└── projects/
    └── <pathId>/
        ├── path                # absolute path string (1 line, canonical)
        ├── runtimes.json       # OPTIONAL per-project runtime overrides
        └── agents/
            └── <agent-id>/
                ├── active-session     # session id (string)
                ├── tmux-session       # tmux session name (v0.4 sibling file)
                └── log.jsonl
```

Created on first boot. Token is generated fresh if missing. Each `projects/<pathId>/` subtree is created lazily — the first time an agent is spawned or a runtime override is written for that path.

### Per-path tree — `<picked-folder>/.f-mark/`

```
<picked-folder>/.f-mark/
├── sessions/
│   └── <date>-<slug>/          # session data (events)
├── participants.json           # project participants (renamed from config.json)
└── AGENT.md                    # project agent documentation (optional)
```

`<picked-folder>/.f-mark/` is created **only** when the first session in that path is created (or the user first registers a project-scoped participant for that path).

### Why this split

- **Global**: anything tied to the user/kernel/OS — auth, active-path memory, tmux sessions (OS processes that outlive any folder rename), agent log archives.
- **Per-path**: anything tied to the project's content — session event logs, the project's participant roster, AGENT.md.

### Participants split

Today `<path>/.f-mark/config.json` is `{ version, port, participants }`. We split this:

- `~/.config/f-mark/config.json` — `{ version, port, host }` (global server config — there's only one server).
- `<path>/.f-mark/participants.json` — `{ participants: Record<id, Participant> }`.

Existing code (`packages/kernel/src/project.ts`, `packages/kernel/src/participants.ts`, `packages/kernel/src/events/writer.ts:47`) reads participants via `readConfig(p)`. We replace those calls with `readParticipants(activePaths)` reading the new per-path file. The default-user-id seeding behavior (`packages/kernel/src/project.ts:29-38`) moves to first-session-create in a path.

## State.json Shape

```jsonc
{
  "activePath": "/home/roey/projects/foo",   // null on first boot
  "activeRevision": 7,                        // monotonic; bumped on every switch
  "knownPaths": [                             // auto-tracked recents, MRU, cap 20
    "/home/roey/projects/foo",
    "/home/roey/projects/bar"
  ],
  "favorites": [                              // user-curated, no cap
    { "name": "F-Mark dev",  "path": "/home/roey/workspace/F-Mark" },
    { "name": "Side hustle", "path": "/home/roey/side" }
  ]
}
```

`activeRevision` is the key piece for race-free WS handling: every broadcast message carries the revision number that was current when it was published. Renderer compares against its locally-known revision and discards mismatched messages.

## Paths Refactor

Replace the singleton `paths(root)` with three concerns:

```ts
// packages/kernel/src/paths/global.ts
export interface GlobalPaths {
  configDir(): string;
  tokenFile(): string;
  stateFile(): string;
  configFile(): string;
  defaultRuntimesFile(): string;
  projectDir(pathId: string): string;
  projectPathFile(pathId: string): string;
  projectRuntimesFile(pathId: string): string;
  projectAgentsDir(pathId: string): string;
  projectAgentDir(pathId: string, agentId: string): string;
}
export function globalPaths(homeOrXdg: string = resolveXdgConfigHome()): GlobalPaths;

// packages/kernel/src/paths/active.ts
export interface ActivePaths {
  root(): string;                  // the picked folder
  pathId(): string;                // derived once at instantiation
  fmarkDir(): string;
  sessionsDir(): string;
  sessionDir(id: string): string;
  participantsFile(): string;
  agentMd(): string;
}
export function activePaths(root: string): ActivePaths;

// packages/kernel/src/paths/context.ts
export interface PathContext {
  global: GlobalPaths;
  active: ActivePaths | null;
}
```

`createServer` no longer takes `deps.paths`. It takes `deps.pathContextRef` — a mutable container. Route registrations bind a getter to the live context (analogous to how `busRef` is captured today in `packages/kernel/src/server.ts:140-156`). Routes that need an active path call `requireActive(ctx)`, which 409s with `NO_ACTIVE_PATH` when `active` is null.

This is a real refactor: every route currently taking `paths` (`registerParticipantRoutes`, `registerAgentsRoutes`, `registerSessionRoutes`, `registerEventRoutes`, `registerTodoRoutes`, `registerFileRoutes`, `registerHtmlRoutes`, `registerFlowRoutes`, `registerRawRoutes`, `registerPresetRoutes`, `registerSearchRoutes`, `registerGuideRoute`, `registerManagedAgentsRoutes`, `registerHookInstallRoutes`, `registerEnvProbeRoute`) updates to take a getter or a `PathContext` and to gracefully 409 when no active path. Tmux manager construction also moves out of one-shot creation; see "Tmux Manager" below.

## Kernel Boot

```
1. Resolve config dir: $XDG_CONFIG_HOME/f-mark, fallback ~/.config/f-mark.
2. mkdir -p configDir.
3. Read or create .token (generate if missing; chmod 600).
4. Read state.json (default if missing: { activePath: null, activeRevision: 0, knownPaths: [], favorites: [] }).
5. If CLI flag --path /foo is present, override state.activePath = /foo and bump revision.
6. If activePath is set:
   a. realpathSync the folder; verify it's a directory and writable.
   b. If invalid → set activePath = null, log warning, persist.
   c. If valid → instantiate ActivePaths(activePath); start file watcher.
   d. Compute pathId; ensure ~/.config/f-mark/projects/<pathId>/path matches (write if missing/different).
7. Start HTTP/WS server.
```

No `findFmarkDir(cwd)` walk in the kernel boot path. The function stays in the codebase because hooks still use it as a fallback (see "Hook Discovery" below).

## CLI

- `f-mark` — boots with state.json's activePath (or null).
- `f-mark --path /abs/path` — overrides activePath for this run; persists to state.json.
- `f-mark --no-active-path` — boots with null activePath even if state.json says otherwise. Useful for first-time setup or recovery.

## Endpoints

### Paths

- `GET /paths` → `{ activePath, activeRevision, knownPaths, favorites }`.
- `POST /paths/active` body `{ path }` → validates (realpath, exists, writable), updates activePath + bumps activeRevision, persists state.json, recycles watcher, recreates tmux manager binding, broadcasts `path-switched`. Errors: 400 `{ code: "PATH_NOT_FOUND", ... }`, 403 `{ code: "PATH_NOT_WRITABLE", ... }`, 500 `{ code: "WATCHER_START_FAILED", ... }` (revert on failure).
- `DELETE /paths/known?path=/abs` → drop a recent. Path as query param (no DELETE bodies).
- `DELETE /paths/active` → clear activePath (renderer goes to empty state).

### Favorites

- `POST /paths/favorites` body `{ name, path }` → add. 400 on duplicate path. Path does not need to exist on disk.
- `DELETE /paths/favorites?path=/abs` → remove.
- `PATCH /paths/favorites` body `{ path, newName }` → rename.

### Filesystem browse

- `GET /fs/list?path=/abs/path` → `{ path, parent, entries: [{ name, isDir }] }`. Only directories returned.
  - **Security tightening**: requires bearer auth like other routes; canonicalizes with `realpathSync` before any check; rejects paths under `/proc`, `/sys`, `/dev` (configurable deny-list); caps `entries` at 1000 (truncates with a `truncated: true` field); does not follow symlinks pointing outside the user's home directory (configurable; default-on safety net). Origin/Host header validation is already enforced by the auth layer.
- `GET /fs/home` → `{ home, xdgConfigHome }`. Useful default starting points for the picker.

### Sessions

`POST /sessions` body `{ path, slug }`:
- Validates `path` (absolute, exists, writable). 400 with structured error.
- Validates `slug` (existing regex `^[a-z0-9-]+$`). 400 `INVALID_SLUG`.
- `mkdir -p <path>/.f-mark/sessions/<date>-<slug>/` — the **only** auto-create after boot.
- If participants.json missing in this path, initialize it with the default user participant.
- Add `path` to knownPaths (MRU push, cap 20).
- Set activePath = path; bump activeRevision.
- Broadcast `path-switched` if path changed.
- Returns `{ id, slug, created_at, path, pathId }`.

`GET /sessions` returns sessions in the active path only.
- 409 `NO_ACTIVE_PATH` if there's no active path.
- Returns `[]` if `.f-mark/sessions/` does not exist (does **not** mkdir). The `packages/kernel/src/sessions.ts:68` `await mkdir(p.sessionsDir(), { recursive: true })` is removed; same change in `createSession` retains the mkdir only on the create path.

### Path-aware event/participant routes

All routes that scope to a session continue to accept the session id in the URL. Internally they consult `requireActive(ctx)` and resolve files via `activePaths`. New error: any of `/sessions/:id/...`, `/participants/...`, `/todos/...`, `/raw/...`, `/search`, `/presets/...`, `/flow`, `/html/...` return 409 `NO_ACTIVE_PATH` when `active` is null.

### Hook posts

Hook posts (today: `POST /sessions/:id/events/prose` etc., called from `f-mark hook auto-stream`) accept an additional optional body field: `path` (absolute). When present, the kernel resolves it to a `pathId` and verifies it matches the session's home path. When absent, the kernel falls back to `activePath` (current behavior, but now with a clear failure path: 409 if no activePath, 422 if session belongs to a different path than activePath).

The CLI hook entry (`f-mark hook auto-stream`) is updated to:
- Prefer `$F_MARK_PATH` env var → include in post body.
- Fallback: upward walk for `.f-mark/sessions/<session-id>/`. Walk finds the project, computes pathId, includes path in post body.
- Fail clearly if neither resolves: print "F-Mark: no project path known (set F_MARK_PATH or run inside a project folder)".

## Tmux Manager

`createTmuxManager` today (`packages/kernel/src/server.ts:198-201`) takes `projectRoot: string` and uses it for both `cwd` of spawned panes and the `@fmark-project` tag (`packages/kernel/src/tmux/manager.ts:107`).

Changes:
1. Replace the raw-path tag with `@fmark-path-id` set to the current `pathId`.
2. The manager is constructed once at boot with the initial active context, **and is re-bound on every path switch**: a `manager.rebind({ projectRoot, pathId })` method updates the values used for new spawns and the filter used in `list`. Existing tmux sessions are untouched — they keep their original tag and remain bound to their original pathId. After a path switch, `manager.list()` filters to the new pathId by default; managed-agent routes that need cross-path visibility can opt in to "all" mode.
3. On spawn, the manager sets `F_MARK_PATH=<projectRoot>` in the agent pane's environment so hooks invoked from inside the pane can discover the project path without an upward filesystem walk.
3. The v0.4 spec's "tmux session naming" stays as-is. The tag value changes from a raw path to a pathId; the naming convention (date + slug + agent kind) is unaffected.

### Reconcile

`packages/kernel/src/reconcile.ts:46` currently scans `paths.fmarkDir()/agents/`. It now scans `~/.config/f-mark/projects/<pathId>/agents/` for the active pathId. The scan is path-scoped, so cross-path agents are not touched by reconcile. A separate `reconcileAll()` (deferred to v0.5.1) can sweep all pathIds at boot to rebuild presence state for backgrounded projects.

## WebSocket Protocol

Every WS message gains two fields:

```ts
{
  type: "...",
  pathId: string,            // identity of the path this message describes
  revision: number,          // activeRevision at time of publish
  ...rest                    // existing payload
}
```

Renderer filter:
- If the message is "path-switched", apply it unconditionally.
- Otherwise: discard if `revision !== store.activeRevision`. Discard if `pathId !== currentPathId`.

This guarantees that an in-flight `event_added` from path A delivered after a switch to path B is discarded by both the revision check (stale) and the pathId check (wrong path).

New message:

```ts
{
  type: "path-switched",
  activePath: string | null,
  previousPath: string | null,
  pathId: string | null,
  revision: number
}
```

Clients receiving this:
- Clear sessions list, current session, panel state.
- If activePath is non-null: refetch `GET /paths` + `GET /sessions` + `GET /participants`.
- If activePath is null: show empty state.
- Apply the new `pathId` and `revision` to local state so subsequent message filters work.

## Watcher Recycling

On `POST /paths/active`:

1. Close current chokidar watcher.
2. Instantiate ActivePaths for new root.
3. If `<root>/.f-mark/sessions/` exists, open new chokidar watcher rooted there. If it doesn't exist, defer watcher startup until first session is created in this path (no mkdir).
4. Rebind tmux manager (`manager.rebind`).
5. Bump activeRevision; broadcast `path-switched`.

Watcher startup failure (permissions error, e.g.): revert activePath to previous, return 500 with structured error. Renderer treats this as a transient error — does not change its state.

## Renderer State (Zustand store)

Add:

```ts
activePath: string | null;
activeRevision: number;
activePathId: string | null;       // derived; mirrors what kernel publishes
knownPaths: string[];
favorites: { name: string; path: string }[];

setActivePathState(p: {
  activePath: string | null;
  activeRevision: number;
  pathId: string | null;
}): void;
setKnownPaths(p: string[]): void;
setFavorites(f: { name: string; path: string }[]): void;
```

Bootstrap (`packages/renderer/src/App.tsx:121-135`) is reworked: 
- `GET /paths` always runs first.
- If activePath is null → set empty state; do not call `listSessions` / `listParticipants`.
- If activePath is non-null → `Promise.all([listSessions, listParticipants])`. If either 409s (race with mid-bootstrap kill), fall back to empty state.

On `path-switched` WS message: clear sessions/currentSession/events/participants caches; apply new pathId+revision; refetch as above.

## Topbar Path Switcher

New `packages/renderer/src/shell/PathSwitcher.tsx`.

```
[★ F-Mark dev]  ▼
```

Dropdown:
- Active row at top with checkmark.
- "★ Favorites" section: each favorite by custom name + tiny path subtitle.
- "Recents" section: knownPaths minus favorites, raw path.
- "Pick another folder…" → opens FolderPicker.
- "No active path" state: shows "Pick a folder to begin →".

Switching calls `POST /paths/active`; WS broadcast triggers the reload.

## Folder Picker

`packages/renderer/src/modals/FolderPicker.tsx`. Used by NewSessionModal Browse button and the topbar's "Pick another folder…".

```
┌─ Pick a folder ─────────────────────────────────────┐
│ ★ Favorites:  [F-Mark dev]  [Side hustle]  [+ save] │
├─────────────────────────────────────────────────────┤
│ / home / roey / projects /                          │
├─────────────────────────────────────────────────────┤
│  📁 web-app                                          │
│  📁 cli-tools                                        │
│  📁 notes                              (focused)     │
│  📁 .config                                          │
│  📁 archived                                         │
├─────────────────────────────────────────────────────┤
│                       [ Cancel ]  [ Use this folder ]│
└─────────────────────────────────────────────────────┘
```

Behavior:
- Default start: activePath if set, else `GET /fs/home`'s `home`.
- Double-click folder or Enter on focused row → `GET /fs/list?path=<descended>`.
- Breadcrumbs clickable to jump.
- Favorites strip: click a chip → jumps. `+ save` → inline name prompt → `POST /paths/favorites`.
- Keyboard: arrows, Enter descends, Esc cancels, Cmd/Ctrl+Enter picks current dir.
- "Use this folder" picks the currently-displayed dir (not a row selection).
- Returns the chosen absolute path to the caller.

## NewSessionModal Changes

**Removed:**
- `<TemplateGrid>` + section.
- `<AgentInvite>` + section.
- Slug input prefix (`.f-mark/sessions/<YYYY-MM-DD>-`).
- Footer "Path:" hint line.
- Template state + starter-prose post.
- Invite state.

**Files deleted:**
- `packages/renderer/src/modals/newsession/TemplateGrid.tsx`
- `packages/renderer/src/modals/newsession/templates.ts`
- `packages/renderer/src/modals/newsession/AgentInvite.tsx`
- `packages/renderer/src/modals/newsession/SlugInput.tsx` (replaced by a plain input)
- Associated tests.

**New fields:**

1. **Folder** — read-only display of the picked path + "Browse…" button → opens `FolderPicker`. Defaults to activePath. Required.
2. **Slug** — plain text input. Same regex as today (`^[a-z0-9-]+$`). Placeholder `my-session`. No path-prefix display.

**Kept:**
- `<OpenAndCopyToggle>`.
- Cancel + Create in footer (no path string).

**Submit:** `POST /sessions { path, slug }`. On success, the WS `path-switched` broadcast (if path changed) drives the rest.

## Migration

The user has confirmed clean slate for their own dev `.f-mark/`. The "no migration" stance in Non-Goals applies to **session content** (event logs, todos, prose) — those are not auto-imported.

A narrow **v0.4 transition** is in scope, because the v0.4 tmux work has already touched `<repo>/.f-mark/agents/` and `runtimes.json`. Without a shim, users who upgrade through v0.4 → v0.5 would silently abandon their managed-agent state. One-shot migration on first v0.5 boot, gated by absence of `~/.config/f-mark/state.json`:

- If `<cwd>/.f-mark/agents/` exists: compute pathId for `<cwd>`, move agents subtree to `~/.config/f-mark/projects/<pathId>/agents/`, add `<cwd>` to knownPaths, set as activePath.
- If `<cwd>/.f-mark/runtimes.json` exists: move to `~/.config/f-mark/projects/<pathId>/runtimes.json`.
- If `<cwd>/.f-mark/config.json` exists: split it. `participants` → `<cwd>/.f-mark/participants.json`. `version`/`port`/`host` → `~/.config/f-mark/config.json` (only if global file is missing).
- Existing `<cwd>/.f-mark/sessions/` is **left in place untouched**. Users see those sessions because activePath is set to `<cwd>`. No copy, no move, no `pathId` rewrite of session contents.

After migration runs once, subsequent boots only read global state. This is the only path-data import behavior in scope.

## Error Handling

Structured errors everywhere. Shape: `{ code: string, message: string, details?: object }`.

Codes:
- `NO_ACTIVE_PATH` (409): operation requires an active path.
- `PATH_NOT_FOUND` (400): given path doesn't exist or isn't a directory.
- `PATH_NOT_WRITABLE` (403): permission denied.
- `PATH_NOT_CANONICAL` (400): `realpath` failed.
- `INVALID_SLUG` (400): regex mismatch.
- `WATCHER_START_FAILED` (500): chokidar refused; switch reverted.
- `STALE_PATH` (409): the pathId in the request body doesn't match active path.
- `FS_DENIED` (403): /fs/list refused this directory (pseudo-fs, symlink escape).
- `FS_TRUNCATED` (200 with body flag): too many entries; truncated to 1000.

Specific behaviors:
- **activePath went away mid-session.** Kernel sets activePath = null on next sensitive operation, broadcasts `path-switched { activePath: null }`. Renderer goes to empty state.
- **Switching to a non-existent path.** 400 PATH_NOT_FOUND. Renderer offers "Remove from list" → DELETE.
- **In-flight WS event from old path after switch.** Caught by revision and pathId checks. Discarded silently.
- **Two browser tabs open during switch.** Both see `path-switched`, both refetch. Same activePath shown.
- **Hook posts to a session that's no longer in the active path.** 409 STALE_PATH with details of which path the session belongs to. Hooks targeting an idle background project: kernel can optionally accept these without affecting activePath (controlled by a `--quiet-cross-path-hooks` flag, default off).

## Tests

**Kernel:**
- `paths/global.test.ts` — XDG resolution, project subtree creation, path file r/w.
- `paths/active.test.ts` — root/pathId/fmarkDir derivation.
- `paths/identity.test.ts` — pathId stability across symlinks; ENOENT handling.
- `state/store.test.ts` — read/write of state.json, default on missing, MRU cap, revision bump.
- `routes/paths.test.ts` — active/known/favorites CRUD, structured errors.
- `routes/fs.test.ts` — listing, hidden dirs, parent, deny-list (/proc), symlink escape blocked, truncation.
- `routes/sessions.test.ts` — 409 with no active path; 400 PATH_NOT_FOUND; lazy `.f-mark/` create on POST; `GET /sessions` returns `[]` without mkdir.
- `routes/events.test.ts` — 409 with no active path; STALE_PATH when body.path mismatches active.
- `routes/participants.test.ts` — per-path participant scoping; default user seeded on first session create.
- `boot.test.ts` — first boot creates global tree; no `.f-mark/` in cwd; --path overrides; migration one-shot.
- `boot/migration.test.ts` — existing v0.4 cwd is correctly partitioned into projects/<pathId>/.
- `watcher.test.ts` — recycle on switch, no mkdir for empty path, revert on start failure.
- `ws/broadcast.test.ts` — every message includes pathId + revision; `path-switched` broadcast; stale revision discard on renderer side (in renderer tests).
- `tmux/manager.test.ts` — `@fmark-path-id` tag in spawn; `rebind` updates filter; list filters by new pathId.
- `reconcile.test.ts` — scans projects/<pathId>/agents only, not other paths.
- `hooks/post.test.ts` — body.path resolves to pathId; hook with no path env walks upward; STALE_PATH return on cross-path post.

**Renderer:**
- `modals/FolderPicker.test.tsx` — navigation, keyboard, favorites strip, save-as-favorite, deny-list rendering.
- `modals/NewSessionModal.test.tsx` — template/invite/path-string removed; two fields render; create posts `{ path, slug }`.
- `shell/PathSwitcher.test.tsx` — dropdown, active checkmark, favorites/recents groups, empty state.
- `state/store.test.ts` — `path-switched` clears derived state and refetches; stale-revision WS message ignored.
- `App.test.tsx` — bootstrap handles 409 NO_ACTIVE_PATH gracefully (no thrown unhandled rejection).
- `App.test.tsx` — pathId mismatch on `event_added` is ignored.

**Integration:**
- E2E: pick folder, create session, switch path, create another, switch back, both lists correct.
- E2E: spawn a managed agent in path A, switch to path B — A's tmux session still visible via `manager.list({ all: true })`; reconcile in B does not touch A's agents.
- E2E: hook auto-stream from agent spawned in A continues posting to A's session after kernel switches activePath to B.

## Files Touched

**Added:**
- `packages/kernel/src/paths/global.ts`
- `packages/kernel/src/paths/active.ts`
- `packages/kernel/src/paths/identity.ts`
- `packages/kernel/src/paths/context.ts`
- `packages/kernel/src/state/store.ts`  (state.json r/w)
- `packages/kernel/src/routes/paths.ts`
- `packages/kernel/src/routes/fs.ts`
- `packages/kernel/src/participants/file.ts`  (participants.json r/w; replaces config-embedded logic)
- `packages/renderer/src/modals/FolderPicker.tsx`
- `packages/renderer/src/shell/PathSwitcher.tsx`
- `packages/shared/src/paths.ts`  (types for paths/favorites + WS path envelope)
- All test files listed above.

**Modified (representative — every route that took `paths` is affected):**
- `packages/kernel/src/paths.ts` — re-export shim; callers migrate.
- `packages/kernel/src/index.ts` — boot sequence, CLI flags.
- `packages/kernel/src/server.ts` — `pathContextRef` instead of `paths`; route registrations updated.
- `packages/kernel/src/sessions.ts` — `ActivePaths`; lazy `.f-mark/`; `listSessions` no eager mkdir.
- `packages/kernel/src/project.ts` — split into participants file vs. global config.
- `packages/kernel/src/participants.ts` — read from `participantsFile()`.
- `packages/kernel/src/events/writer.ts` — `requireActive(ctx)`.
- `packages/kernel/src/watcher.ts` — recycle API.
- `packages/kernel/src/routes/sessions.ts`, `events.ts`, `todos.ts`, `raw.ts`, `search.ts`, `presets.ts`, `flow.ts`, `html.ts`, `guide.ts`, `managedAgents.ts`, `hookInstall.ts`, `envProbe.ts` — 409 + path-aware.
- `packages/kernel/src/routes/guide.ts:107` — token line points at `~/.config/f-mark/.token`; "project root" guidance updated.
- `packages/kernel/src/agents/activeSession.ts` — paths now under projects/<pathId>/agents/<id>/.
- `packages/kernel/src/runtimes/registry.ts` — global file + per-project overrides.
- `packages/kernel/src/tmux/manager.ts` — `@fmark-path-id` tag; `rebind`.
- `packages/kernel/src/reconcile.ts` — scans projects/<pathId>/agents only.
- `packages/kernel/src/hooks/bootstrap.ts` — token from global path; `F_MARK_PATH` env support; `findFmarkDir` retained as fallback.
- `packages/kernel/src/ws/bus.ts` — all message types gain `pathId`+`revision`; `path-switched` type added.
- `packages/renderer/src/state/store.ts` — new fields and actions.
- `packages/renderer/src/App.tsx` — 409-aware bootstrap; WS message filtering by pathId+revision.
- `packages/renderer/src/modals/NewSessionModal.tsx` — trim + new fields.
- `packages/renderer/src/shell/TopBar.tsx` — mount PathSwitcher.
- `packages/renderer/src/api/client.ts` — new endpoints; structured-error parsing.

**Deleted:**
- `packages/renderer/src/modals/newsession/TemplateGrid.tsx`
- `packages/renderer/src/modals/newsession/templates.ts`
- `packages/renderer/src/modals/newsession/AgentInvite.tsx`
- `packages/renderer/src/modals/newsession/SlugInput.tsx`
- Tests for the deleted files.

## Implementation Phasing

This is a substantial refactor (~3–5 days of focused work). The implementation plan (created by writing-plans after this spec is approved) will split it into phases that each leave the kernel in a usable state:

1. **P1 — Identity + global tree (no UI change).** Add `pathId`, `GlobalPaths`/`ActivePaths`, state.json, /paths routes. Keep activePath defaulting to cwd **as a transitional behavior only** so existing UI/hooks keep working during the refactor; this default is removed in P4 when the picker UI is in place.
2. **P2 — Per-path participants + WS envelope.** Move participants out of config.json; add pathId+revision to all WS messages; renderer filters on them; bootstrap handles 409.
3. **P3 — Managed-agent partitioning.** Move agents/ + runtimes overrides under projects/<pathId>/; rebindable tmux manager; reconcile scoped to pathId. Migration shim for v0.4 cwd.
4. **P4 — Folder picker + NewSessionModal trim + path switcher.** UI work — folder picker, topbar switcher, modal rewrite.
5. **P5 — Hook discovery + CLI flag.** `F_MARK_PATH` env, hook fallback walk, `--path` CLI flag, structured errors.

Each phase has its own test gate. P1+P2 are the highest-risk; P4 is the most user-visible.

## Risks & Open Questions

- **`pathId` collisions on truncated SHA-256.** 48 bits → birthday probability 1-in-a-million at ~24 million paths. Mitigation: increase to 16 hex chars (64 bits) if anyone hits a collision (none expected).
- **Realpath through bind mounts and overlay filesystems.** Linux containers/dev environments may produce non-stable realpath. Mitigation: document the limitation; an explicit `--path-canonical raw` boot flag bypasses realpath for users with exotic setups.
- **Hooks posting from non-managed environments.** If the agent isn't spawned via tmux (manual setup), `$F_MARK_PATH` isn't set; the upward `findFmarkDir` walk only works after the path has a `.f-mark/`. Until a session is created in a path, hooks from that path can't post. Acceptable — hooks are only meaningful once a session exists.
- **One file watcher per kernel.** Backgrounded paths don't get live event updates. For v0.5 the UI only ever shows the active path's events, so this is fine. Multi-tab work (future) would need per-path watchers or a shared multi-root watcher.
- **`projects/<pathId>/` orphans after folder move.** If a user renames `/foo/bar` → `/foo/baz`, the old pathId's agents directory becomes orphaned; a new pathId tree is created on next activate. Mitigation: a `f-mark paths gc` CLI subcommand removes orphan project subtrees (deferred to v0.5.1).
- **Concurrent state.json writes.** Two browser tabs both POSTing favorites at once race. Mitigation: kernel serializes state.json writes with a file lock (`proper-lockfile`) or holds an in-memory mutex.
- **/fs/list deny-list completeness.** `/proc`/`/sys`/`/dev` is a starting list. Other pseudo-fs (`/run`, `/var/run`) may also be undesirable. Mitigation: maintain the list explicitly in code and tested; users can extend via config in v0.5.1.

## Future Work (deferred)

- **Multi-tab simultaneous paths.** Per-WS-connection active-path with a path-revision per tab.
- **`reconcileAll()`** at boot — rebuild presence state for every known pathId, not just active.
- **`f-mark paths gc`** — clean orphan `projects/<pathId>/` subtrees.
- **Folder-move repair** — detect path moves and re-bind pathId to new absolute path.
- **Path sync across machines.** Cloud-stored favorites/recents.
- **Re-adding templates/agent invite** if removed for UX reasons but later wanted back (recoverable from git history).
- **`f-mark hook` discovery from arbitrary cwd** when the path is fully empty (no `.f-mark/`) — would require a global `pathId → agentId` index.

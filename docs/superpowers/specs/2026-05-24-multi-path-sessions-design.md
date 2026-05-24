# Multi-Path Sessions — Design Spec

> **Status:** brainstorm complete, pending Codex second-opinion + merge.
> **Targets:** F-Mark v0.5 (post-tmux-orchestration). This spec sits on top of the v0.4 tmux work in `2026-05-23-tmux-agent-orchestration-design.md` — runtime registry and managed-agent state move to the global location introduced here, but the orchestration model itself is untouched.

## Summary

Today the F-Mark kernel boots anchored to a single working directory (`process.cwd()`) and creates `.f-mark/` there automatically. All sessions, the auth token, the runtimes registry, and managed-agent state share that one root. This change splits the model into:

1. **Global `~/.config/f-mark/`** — user/machine-level: auth token, active-path state, recents, favorites, runtimes registry, managed-agent state, default config.
2. **Per-path `<picked-folder>/.f-mark/`** — project-level, created lazily: sessions, project-specific `AGENT.md`. A path with no sessions has no `.f-mark/` at all.

Users explicitly pick a folder when creating a session, can save folders as named favorites, and switch the kernel's active path at runtime. The kernel does not auto-create any `.f-mark/` at boot.

The session creation modal is also trimmed: template/invite sections and both path display strings are removed; two fields remain — Folder (picker) and Session name.

## Goals

1. **No surprise filesystem writes.** Kernel boot never creates a project-level `.f-mark/`. The only auto-created directory is `~/.config/f-mark/`, and only when global state is read/written for the first time.
2. **Explicit per-session folder choice.** Each session lives where the user said it should live. Sessions are portable: moving the folder moves the session.
3. **Multiple paths per kernel.** A single running kernel can be pointed at any folder. Switching paths refreshes sessions, watchers, and WebSocket subscriptions cleanly.
4. **Favorites with custom names.** Users can save frequently-used paths under human-readable names ("Work project", "Side hustle") and switch by name from the topbar.
5. **Trimmed session-create UI.** Template and invite sections are removed; the path display is removed from the input and the footer; a session name field replaces the slug-with-prefix input.

## Non-Goals

- **Multi-tab simultaneous paths.** One activePath per kernel. If users want two paths open at once, they run two kernels. (Re-evaluate if multi-tab demand is real.)
- **Native OS folder dialog.** The app runs in a browser, not Electron. The File System Access API does not expose absolute paths, so a true OS dialog is impossible without re-platforming. We build a **native-feeling** inline picker (breadcrumbs, keyboard nav, double-click descent, favorites strip) served by the kernel.
- **Migration of existing `.f-mark/` data.** User confirmed clean slate; existing dev sessions in `<repo>/.f-mark/sessions/` will not be auto-imported.
- **Per-path tokens.** One token, in `~/.config/f-mark/.token`. Kernel is single-user; per-path tokens add complexity for no benefit.
- **XDG_CONFIG_HOME override on first pass.** We use `~/.config/f-mark/` literally. (Following XDG fully — respecting `$XDG_CONFIG_HOME` — is captured under Future Work.)
- **Windows path semantics.** Same WSL stance as v0.4: Windows users go through WSL; native Windows paths are out of scope.
- **Path-share / cross-kernel sync.** Favorites and recents are per-machine. No sync between machines.

## Architecture Overview

Two trees, both created lazily.

### Global tree — `~/.config/f-mark/`

```
~/.config/f-mark/
├── .token                # auth token (one per user)
├── state.json            # { activePath, knownPaths[], favorites[] }
├── config.json           # global defaults (theme, default editor, etc.)
├── runtimes.json         # managed-agent runtime registry (moved from per-path)
└── agents/               # managed-agent state, logs, pids (moved from per-path)
    └── <agent-id>/
        ├── active-session
        ├── tmux-session
        └── log.jsonl
```

Created on first boot. The token is generated fresh if missing.

### Per-path tree — `<picked-folder>/.f-mark/`

```
<picked-folder>/.f-mark/
├── sessions/
│   └── <date>-<name>/    # session data (events, named-prose, todos)
└── AGENT.md              # project-specific agent instructions (optional)
```

`<picked-folder>/.f-mark/` is created **only** when the first session in that path is created. A path the user has merely browsed into has no `.f-mark/`. A path with all sessions deleted retains the empty `.f-mark/sessions/` directory (we do not auto-clean — too aggressive).

### Why this split

- **Global**: anything tied to the user or the kernel process — auth, active-path memory, managed-agent OS-level state (tmux sessions live across paths; their registry must too).
- **Per-path**: anything tied to the project being worked on — session event logs and the project's own agent documentation.

## State.json Shape

```jsonc
{
  "activePath": "/home/roey/projects/foo",   // null on first boot
  "knownPaths": [                             // auto-tracked recents, MRU order, capped at 10
    "/home/roey/projects/foo",
    "/home/roey/projects/bar"
  ],
  "favorites": [                              // user-curated, no cap
    { "name": "F-Mark dev",  "path": "/home/roey/workspace/F-Mark" },
    { "name": "Side hustle", "path": "/home/roey/side" }
  ]
}
```

`knownPaths` and `favorites` are separate lists. A path can be in both. The picker renders favorites prominently (custom name) and recents below (raw path).

## `Paths` Refactor

Current `packages/kernel/src/paths.ts` returns a singleton anchored to one root. Replace with:

```ts
// packages/kernel/src/paths/global.ts
export interface GlobalPaths {
  configDir(): string;       // ~/.config/f-mark
  tokenFile(): string;       // ~/.config/f-mark/.token
  stateFile(): string;       // ~/.config/f-mark/state.json
  configFile(): string;      // ~/.config/f-mark/config.json
  runtimesFile(): string;    // ~/.config/f-mark/runtimes.json
  agentsDir(): string;       // ~/.config/f-mark/agents
  agentDir(id: string): string;
}
export function globalPaths(home: string = os.homedir()): GlobalPaths { ... }

// packages/kernel/src/paths/active.ts
export interface ActivePaths {
  root(): string;            // the picked folder
  fmarkDir(): string;        // <root>/.f-mark
  sessionsDir(): string;     // <root>/.f-mark/sessions
  sessionDir(id: string): string;
  agentMd(): string;         // <root>/.f-mark/AGENT.md
}
export function activePaths(root: string): ActivePaths { ... }
```

A request-scoped helper exposes both:

```ts
interface RequestContext {
  global: GlobalPaths;
  active: ActivePaths | null;   // null when no path is active
}
```

Every route that touches sessions calls `requireActive(ctx)` which 409s with `NO_ACTIVE_PATH` if `active` is null. Routes that touch global state (favorites, runtimes, /paths, /fs/list) only need `ctx.global`.

## Kernel Boot

```
1. Ensure ~/.config/f-mark/ exists. mkdir -p.
2. Read or create .token. (Generate if missing.)
3. Read state.json. If missing → { activePath: null, knownPaths: [], favorites: [] }.
4. If activePath is set:
   a. Validate the folder still exists and is writable.
   b. If invalid → set activePath = null, log a warning, persist.
   c. If valid → instantiate ActivePaths(activePath), start the file watcher.
5. Start HTTP/WS server. Routes that need an active path return 409 when null.
```

No `findFmarkDir(cwd)` walk. No `process.cwd()` reference outside of dev/test entrypoints.

## Endpoints

### Paths

- `GET /paths` → `{ activePath, knownPaths, favorites }`.
- `POST /paths/active { path }` → validates, sets activePath, recycles watcher, broadcasts `path-switched` on WS. 400 if path doesn't exist or isn't a directory; 403 if not writable.
- `DELETE /paths/known { path }` → drop a recent (e.g., user moved the folder).

### Favorites

- `POST /paths/favorites { name, path }` → add. 400 on duplicate path or empty name. Path need not exist on disk (favorites can be aspirational).
- `DELETE /paths/favorites { path }` → remove by path.
- `PATCH /paths/favorites { path, newName }` → rename.

### Filesystem browse

- `GET /fs/list?path=/abs/path` → `{ path, parent, entries: [{ name, isDir }] }`. Only directories returned (we don't surface files in a folder picker). Hidden dirs (leading `.`) included; renderer can choose to hide.
- `GET /fs/home` → `{ home: "/home/roey" }`. Used as a sensible default starting point in the picker.

Security: kernel is local single-user, so we don't sandbox `path` beyond requiring it to be absolute and refusing path-traversal sequences (`..` already resolved server-side via `path.resolve`). The kernel only listens on localhost.

### Sessions

`POST /sessions { path, name }`:
- 400 if `path` missing/relative/non-existent/non-directory/non-writable.
- 400 if `name` fails slug validation (same regex as today: `^[a-z0-9-]+$`).
- mkdir `<path>/.f-mark/sessions/<date>-<name>/`. `.f-mark/` is created here if missing — the only auto-create after boot.
- Add `path` to `knownPaths` (MRU push, cap at 10).
- Set `activePath = path` (if different).
- Broadcast `path-switched` if activePath changed.
- Return the created session.

`GET /sessions` returns sessions in activePath only. 409 NO_ACTIVE_PATH if none.

## Watcher Recycling

On `POST /paths/active`:

1. Close the current chokidar watcher (`watcher.close()`).
2. Instantiate ActivePaths for the new root.
3. Open a new chokidar watcher rooted at `activePaths.sessionsDir()`.
4. Re-establish any cached per-session state in the kernel (in-flight reconciles, etc. — should be minimal post-boot).
5. Broadcast WS `path-switched { path }` so every connected renderer reloads.

If the watcher fails to start on the new path (permissions, missing dir), revert activePath and return 500. Document this in the route's contract.

## WebSocket protocol additions

New broadcast message:

```jsonc
{ "type": "path-switched", "activePath": "/new/abs/path" }
```

Clients receiving this:
- Clear sessions list, current-session state, panel state.
- Refetch `GET /sessions`.
- Subscribe their per-session event streams against the new path's sessions.

## Renderer State (Zustand store)

Add to the store:

```ts
activePath: string | null;
knownPaths: string[];
favorites: { name: string; path: string }[];

setActivePath(p: string | null): void;
setKnownPaths(p: string[]): void;
setFavorites(f: { name: string; path: string }[]): void;
```

Bootstrap fetch on app load: `GET /paths` populates all three. On `path-switched` WS message: refetch + clear session-derived state.

## Topbar Path Switcher

New component `packages/renderer/src/shell/PathSwitcher.tsx`. Replaces (or sits next to) the current title. Shows:

```
[★ F-Mark dev]    ▼
```

Dropdown:
- Active row (current, checkmark).
- "★ Favorites" group: each favorite as a row with its name + tiny path subtitle.
- "Recents" group: knownPaths minus favorites, raw path.
- "Pick another folder…" → opens the folder picker modal.
- "Manage favorites…" → opens a small management panel (rename/remove).

Clicking any path row calls `POST /paths/active` and lets the WS broadcast trigger the reload.

## Folder Picker

New component `packages/renderer/src/modals/FolderPicker.tsx`. Used by:
1. NewSessionModal's Folder field (Browse… button).
2. Topbar's "Pick another folder…".

Layout:

```
┌─ Pick a folder ─────────────────────────────────────┐
│ ★ Favorites:  [F-Mark dev]  [Side hustle]  [+]      │  ← favorites strip + "save current"
├─────────────────────────────────────────────────────┤
│ / home / roey / projects /                          │  ← clickable breadcrumbs
├─────────────────────────────────────────────────────┤
│  📁 web-app                                          │
│  📁 cli-tools                                        │
│  📁 notes                              (focused)     │  ← arrow keys navigate
│  📁 .config                                          │
│  📁 archived                                         │
├─────────────────────────────────────────────────────┤
│                       [ Cancel ]  [ Use this folder ]│
└─────────────────────────────────────────────────────┘
```

Behavior:
- Default start: activePath if set, else home dir (`GET /fs/home`).
- Double-click folder or Enter on focused row → descend (`GET /fs/list?path=...`).
- Breadcrumb click → jump.
- Favorites strip: click a chip → jump to that path. `+` button → opens "save current as favorite" prompt (text input for name, save/cancel).
- Keyboard: arrows up/down, Enter descends, Esc cancels, Cmd/Ctrl+Enter accepts current dir.
- "Use this folder" → picks the currently-displayed directory (not a row selection — the *current* dir is what you're using).
- Returns chosen absolute path to caller via prop callback.

## NewSessionModal Changes

**Removed:**
- `<TemplateGrid>` block + section.
- `<AgentInvite>` block + section.
- Slug input prefix (`.f-mark/sessions/<YYYY-MM-DD>-`).
- Footer "Path: …" hint.
- Template-related state (`template`, `templateByKey`, starter-prose post).
- Invite-related state (`selectedAgents`, `toggleAgent`).

**Files deleted:**
- `packages/renderer/src/modals/newsession/TemplateGrid.tsx`
- `packages/renderer/src/modals/newsession/templates.ts`
- `packages/renderer/src/modals/newsession/AgentInvite.tsx`
- Associated tests.

**New fields:**

1. **Folder** — read-only display of the picked path + "Browse…" button → opens `FolderPicker`. Defaults to activePath.
2. **Session name** — plain text input. Same validation regex as today's slug. Placeholder: `my-session`. No path-prefix display.

**Kept:**
- `<OpenAndCopyToggle>`.
- Cancel + Create session in footer (no path string).

**Modal body becomes ~70 lines instead of ~200.**

## Migration

Clean slate. No data migration. On the first run after the upgrade:

- Kernel creates `~/.config/f-mark/` and a fresh token.
- `state.json` initialised with `activePath: null`.
- Renderer loads, sees no active path, shows an empty state: "Pick a folder to start your first session" → button opens FolderPicker.
- Existing `<repo>/.f-mark/` directories are ignored. Users who want to keep old sessions move them manually into a new path's `.f-mark/sessions/`.

Document this as a breaking change in the v0.5 release notes.

## Error Handling

- **activePath went away.** Path validated at boot and on each route call (cheap stat). If invalid mid-session, kernel sets `activePath = null`, broadcasts `path-switched { activePath: null }`, renderer shows the empty state.
- **Switching to a path that no longer exists.** `POST /paths/active` returns 400 with `PATH_NOT_FOUND`. Renderer offers to remove the path from knownPaths/favorites.
- **Permission denied creating session.** `POST /sessions` returns 403 `PATH_NOT_WRITABLE` with the OS error in the body. Modal shows the error inline.
- **WS subscription mismatched after switch.** Renderer drops cached session state on `path-switched`, so race conditions where an in-flight event arrives for the old path are resolved by simply discarding (event references a session id no longer in the list).
- **Two browser tabs open during a switch.** Both see `path-switched`, both refetch. They display the same activePath. Fine by design.

## Tests

**Kernel:**
- `paths/global.test.ts` — paths resolve under `os.homedir()` or supplied home.
- `paths/active.test.ts` — paths resolve under given root.
- `state/store.test.ts` — read/write of `state.json`, missing-file default, knownPaths MRU cap.
- `routes/paths.test.ts` — happy path, validation errors, favorites CRUD, knownPaths delete.
- `routes/fs.test.ts` — list dirs, hidden dirs included, parent resolution, errors.
- `routes/sessions.test.ts` — extended: 409 with no active path, 400 with missing/invalid path, lazy `.f-mark/` creation.
- `boot.test.ts` — first boot creates global tree, no `.f-mark/` in cwd.
- `watcher.test.ts` — extended: recycle on path switch closes old watcher and opens new.
- `ws/broadcast.test.ts` — `path-switched` is sent to all clients.

**Renderer:**
- `modals/FolderPicker.test.tsx` — navigation, keyboard, favorites, save-as-favorite flow.
- `modals/NewSessionModal.test.tsx` — modal trim: template/invite/path-string gone; two fields render; create flow posts `{ path, name }`.
- `shell/PathSwitcher.test.tsx` — dropdown, active checkmark, favorites/recents groups, "Pick another folder…" opens picker.
- `state/store.test.ts` — `path-switched` clears derived state and refetches.

**Integration:**
- End-to-end smoke: pick folder, create session, switch path, create another, switch back, list shows correct sessions.

## Files Touched

**Added:**
- `packages/kernel/src/paths/global.ts`
- `packages/kernel/src/paths/active.ts`
- `packages/kernel/src/state/store.ts`  (state.json r/w)
- `packages/kernel/src/routes/paths.ts`
- `packages/kernel/src/routes/fs.ts`
- `packages/renderer/src/modals/FolderPicker.tsx`
- `packages/renderer/src/shell/PathSwitcher.tsx`
- `packages/shared/src/paths.ts`  (types for paths/favorites)
- Test files listed above.

**Modified:**
- `packages/kernel/src/paths.ts` → re-export or deprecated; callers migrate to new modules.
- `packages/kernel/src/index.ts` → boot sequence.
- `packages/kernel/src/sessions.ts` → take `ActivePaths`, lazy `.f-mark/` create.
- `packages/kernel/src/watcher.ts` → recycle API.
- `packages/kernel/src/routes/sessions.ts` → 409 / path-aware.
- `packages/kernel/src/runtimes/registry.ts` → move to global paths.
- `packages/kernel/src/agents/managed.ts` → move agents dir to global paths. (Coordinates with v0.4 tmux spec — both files affected.)
- `packages/kernel/src/hooks/bootstrap.ts` → token from global paths.
- `packages/renderer/src/modals/NewSessionModal.tsx` → trim + new fields.
- `packages/renderer/src/state/store.ts` → activePath/knownPaths/favorites.
- `packages/renderer/src/shell/TopBar.tsx` → mount `PathSwitcher`.
- `packages/renderer/src/api/client.ts` → new endpoints.
- WS protocol types (shared).

**Deleted:**
- `packages/renderer/src/modals/newsession/TemplateGrid.tsx`
- `packages/renderer/src/modals/newsession/templates.ts`
- `packages/renderer/src/modals/newsession/AgentInvite.tsx`
- `packages/renderer/src/modals/newsession/SlugInput.tsx` (rolled into NewSessionModal as a plain input)
- Tests for the deleted files.

## Risks & Open Questions

- **Coordination with v0.4 tmux work.** `runtimes.json` and `agents/` move from per-path to global. The v0.4 spec assumes per-path locations. If v0.4 ships before this change lands, the implementation plan for v0.5 must include a one-time migration of `<v0.4-cwd>/.f-mark/runtimes.json` → `~/.config/f-mark/runtimes.json`. Worth flagging during /buddy review.
- **AGENT.md per-path vs. global.** We picked per-path because it's project documentation. But the hook-installation flow (v0.4) references AGENT.md — does the new model break copy-pasted hook commands? Re-verify during implementation; may need to fall back to global AGENT.md if per-path is missing.
- **Stat-on-every-route.** Validating activePath on every request is a stat call. Cheap, but worth measuring on slow filesystems (NFS, network mounts). Cache for ~1s if needed.
- **`.f-mark/` discoverability.** Without `process.cwd()` anchoring, users can't `cd` into a folder and have F-Mark "just know." If we want CLI-driven path selection later (`f-mark --path /foo/bar`), it's a small follow-up flag on boot.

## Future Work (deferred)

- **Multi-tab simultaneous paths.** Per-WS-connection active path instead of global.
- **`f-mark --path /foo` CLI flag.** Bypass the picker for scripted workflows.
- **XDG full compliance.** Respect `$XDG_CONFIG_HOME` and `$XDG_DATA_HOME` properly (split state into config vs. data dirs).
- **Templates / agent invite returning** — if removed for UX reasons but later wanted back, the deleted components are recoverable from git history.
- **Path sync across machines.** Cloud-stored favorites/recents.

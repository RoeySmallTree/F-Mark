export const REVIEW_PRIORITIES = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
} as const;

export type ReviewPriority =
  (typeof REVIEW_PRIORITIES)[keyof typeof REVIEW_PRIORITIES];

export const REVIEW_FILTERS = {
  all: "all",
  p1: REVIEW_PRIORITIES.p1,
  p2: REVIEW_PRIORITIES.p2,
  p3: REVIEW_PRIORITIES.p3,
} as const;

export type ReviewFilter =
  (typeof REVIEW_FILTERS)[keyof typeof REVIEW_FILTERS];

export interface ReviewEvidence {
  path: string;
  lines: string;
}

export interface ReviewFinding {
  id: string;
  priority: ReviewPriority;
  area: string;
  title: string;
  summary: string;
  evidence: readonly ReviewEvidence[];
}

export interface ArchitectureCandidate {
  id: string;
  rank: string;
  title: string;
  strength: "Strong" | "Worth exploring";
  problem: string;
  direction: string;
  benefits: string;
  files: readonly string[];
}

export interface FileWorkspaceMitigation {
  id: string;
  rank: string;
  title: string;
  issue: string;
  mitigation: string;
  acceptance: readonly string[];
  files: readonly string[];
}

export const REVIEW_FINDINGS: readonly ReviewFinding[] = [
  {
    id: "protocol-drift",
    priority: REVIEW_PRIORITIES.p1,
    area: "Agent protocol",
    title: "Shipped agent guidance contradicts two implemented flows",
    summary:
      "The obsolete target field is silently stripped with a 200, turning an intended comment into prose. The Codex skill also tells agents to persist hooks globally even though managed launch deliberately injects temporary hooks and MCP. Existing project guides never refresh.",
    evidence: [
      { path: "packages/kernel/assets/AGENT.md", lines: "36–40" },
      {
        path: "packages/kernel/assets/codex-skill/f-mark/SKILL.md",
        lines: "35–85",
      },
      {
        path: "packages/kernel/src/routes/events/schemas.ts",
        lines: "50–106",
      },
      {
        path: "packages/kernel/tests/routes/events.test.ts",
        lines: "249–274",
      },
      {
        path: "packages/kernel/src/routes/managedAgents/codexLaunchInjection.ts",
        lines: "5–92",
      },
    ],
  },
  {
    id: "post-turn-reopen",
    priority: REVIEW_PRIORITIES.p1,
    area: "Turn lifecycle",
    title: "Post-turn hook traffic can reopen a closed turn",
    summary:
      "Injected hook prose is attributed through the user participant. A later user-kind event defeats closure detection and the next managed write marks the agent running again. The recorded incident design has not been carried through to the shared event model.",
    evidence: [
      {
        path: "packages/kernel/src/hooks/autoStream/AutoStreamRunner.ts",
        lines: "448–503",
      },
      {
        path: "packages/kernel/src/hooks/autoStream/dedupe.ts",
        lines: "41–56",
      },
      {
        path: "packages/kernel/src/routes/events/scopedWrite.ts",
        lines: "85–103",
      },
      {
        path: "packages/kernel/src/hooksInstall/codex/spec.ts",
        lines: "53–58",
      },
    ],
  },
  {
    id: "agent-state-race",
    priority: REVIEW_PRIORITIES.p1,
    area: "Agent lifecycle",
    title: "Concurrent agent-state writes lose lifecycle updates",
    summary:
      "Stop, event lifecycle, live text, access polling, and inbox cursors all read, spread, and overwrite the same JSON. A stale writer can resurrect running state or erase pause, access, lifecycle, and cursor fields.",
    evidence: [
      {
        path: "packages/kernel/src/services/agentState.ts",
        lines: "355–435",
      },
      {
        path: "packages/kernel/src/routes/managedAgents/commandService.ts",
        lines: "115–207",
      },
      {
        path: "packages/kernel/src/routes/events/scopedWrite.ts",
        lines: "85–103",
      },
    ],
  },
  {
    id: "codex-poller-loss",
    priority: REVIEW_PRIORITIES.p1,
    area: "Live text",
    title: "One Codex publication failure can skip an entire batch",
    summary:
      "The rollout cursor and fingerprint advance before the awaited event append. If one write fails, that entry and every later entry in the batch are skipped permanently while the outer poll tick suppresses the error.",
    evidence: [
      {
        path: "packages/kernel/src/routes/managedAgents/codexLiveTextPolling.ts",
        lines: "78–107",
      },
      {
        path: "packages/kernel/src/routes/managedAgents/codexLiveTextPolling.ts",
        lines: "130–150",
      },
      {
        path: "packages/kernel/src/routes/managedAgents/codexLiveTextPolling.ts",
        lines: "218–278",
      },
    ],
  },
  {
    id: "cross-root-runtime",
    priority: REVIEW_PRIORITIES.p1,
    area: "Multi-root scope",
    title: "Background-root launch and fork consult active-root state",
    summary:
      "A request resolves the requested root, then runtime and state helpers bypass that binding through the global path context. Background spawn, reconnect, and fork can use the wrong runtime definition or active-session agent set.",
    evidence: [
      {
        path: "packages/kernel/src/routes/managedAgents/launchService.ts",
        lines: "540–545, 697–725",
      },
      { path: "packages/kernel/src/runtimes/store.ts", lines: "10–15" },
      {
        path: "packages/kernel/src/routes/sessions/forkService.ts",
        lines: "81–94, 670–680",
      },
    ],
  },
  {
    id: "session-delete-orphan",
    priority: REVIEW_PRIORITIES.p1,
    area: "Session lifecycle",
    title: "Deleting an active session leaves its pane and binding alive",
    summary:
      "Session deletion removes only the folder. It does not kill tmux, clear agent state, mark membership removed, or publish a session-deleted notification, so the pane continues with an invalid session id.",
    evidence: [
      {
        path: "packages/kernel/src/routes/sessions/mutationRoutes.ts",
        lines: "76–95",
      },
      { path: "packages/kernel/src/sessions.ts", lines: "302–307" },
      {
        path: "packages/kernel/src/routes/managedAgents/spawnRoutes/lifecycleRoutes.ts",
        lines: "53–101",
      },
      { path: "packages/kernel/src/ws/bus.ts", lines: "81–130" },
    ],
  },
  {
    id: "restart-reconcile",
    priority: REVIEW_PRIORITIES.p1,
    area: "Restart recovery",
    title: "Startup reconciliation is single-root and restores no pane pollers",
    summary:
      "After a kernel restart, background-root panes are not reconciled. Surviving active-root panes regain presence but not Codex live-text or access pollers, and the seeded liveness callback cannot later discover pane death.",
    evidence: [
      { path: "packages/kernel/src/index.ts", lines: "344–361" },
      {
        path: "packages/kernel/src/reconcile/StartupReconciler.ts",
        lines: "43–124",
      },
      {
        path: "packages/kernel/src/presence/tracker.ts",
        lines: "51–63",
      },
    ],
  },
  {
    id: "file-save-loss",
    priority: REVIEW_PRIORITIES.p1,
    area: "File editing",
    title: "Open-file editing has three independent data-loss paths",
    summary:
      "An older save response overwrites newer typing, switching files before the 600 ms timer loses the dirty buffer, and save ignores the loaded modification time, allowing stale content to overwrite a tool edit.",
    evidence: [
      {
        path: "packages/renderer/src/panels/fileViewer/renderers/monaco/useMonacoFileText.ts",
        lines: "44–112",
      },
      {
        path: "packages/kernel/src/routes/filesText.ts",
        lines: "115–180",
      },
      {
        path: "packages/renderer/src/api/client/files.ts",
        lines: "74–79",
      },
    ],
  },
  {
    id: "file-invalidation",
    priority: REVIEW_PRIORITIES.p1,
    area: "File editing",
    title: "File invalidation misses the open buffer and background roots",
    summary:
      "The renderer refreshes only the tree and git badges, while the server watches only the globally active root. An open editor in a selected background root stays stale and can later overwrite the external change.",
    evidence: [
      {
        path: "packages/renderer/src/app/AppSocketController.ts",
        lines: "334–348",
      },
      {
        path: "packages/kernel/src/server/runtime.ts",
        lines: "86–99",
      },
      {
        path: "packages/kernel/src/services/filesWatcher.ts",
        lines: "32–104",
      },
    ],
  },
  {
    id: "monaco-comment-workflow",
    priority: REVIEW_PRIORITIES.p1,
    area: "File comments",
    title: "Monaco’s add-comment affordance is not a reliable workflow",
    summary:
      "The gutter plus can be shown even when the poster will silently refuse to open a draft. The implementation contains separate posting and reveal pieces, but no test proves the complete contract: plus → file prose in chat → threaded discussion → click back to the file tab and selected line.",
    evidence: [
      {
        path: "packages/renderer/src/panels/fileViewer/renderers/monaco/useMonacoEditorInteractions.ts",
        lines: "62–105",
      },
      {
        path: "packages/renderer/src/panels/fileViewer/renderers/monaco/useMonacoCommentDraft.ts",
        lines: "38–74",
      },
      {
        path: "packages/renderer/src/panels/fileViewer/lineComment/useFileCommentPoster.ts",
        lines: "67–150",
      },
      {
        path: "packages/renderer/src/panels/fileViewer/lineComment/useFileCommentReveal.ts",
        lines: "86–127",
      },
      {
        path: "packages/renderer/tests/panels/monaco-renderer-edit.test.tsx",
        lines: "183–200",
      },
    ],
  },
  {
    id: "compose-partial-commit",
    priority: REVIEW_PRIORITIES.p1,
    area: "User commits",
    title: "Compose is a retry-unsafe multi-write commit",
    summary:
      "Prose, attachments, wake, turn-end, and final wake commit separately. A late failure either preserves a retry that duplicates earlier events or clears the draft before the intended boundary and wake complete.",
    evidence: [
      {
        path: "packages/renderer/src/compose/ComposeSubmissionController.ts",
        lines: "37–168",
      },
      {
        path: "packages/renderer/src/compose/useComposeSubmission.ts",
        lines: "115–157",
      },
    ],
  },
  {
    id: "session-persistence-collision",
    priority: REVIEW_PRIORITIES.p1,
    area: "Selected session",
    title: "Main-app persistence collides across roots",
    summary:
      "View mode, unread anchor, panes, right tab, and file tabs are keyed by bare session id. Equal ids are valid across roots, and the standalone file tree already uses a composite namespace to avoid the same collision.",
    evidence: [
      {
        path: "packages/renderer/src/state/store/sessionSlice.ts",
        lines: "124–145",
      },
      {
        path: "packages/renderer/src/state/fileViewerTabs.ts",
        lines: "23–82",
      },
      {
        path: "packages/renderer/src/state/panePersistence.ts",
        lines: "17–159",
      },
      {
        path: "packages/renderer/src/state/storageNamespace.ts",
        lines: "17–45",
      },
    ],
  },
  {
    id: "comment-refresh-leak",
    priority: REVIEW_PRIORITIES.p1,
    area: "Event sync",
    title: "A late comment refresh can inject the old session into the new cache",
    summary:
      "Two comment posters fetch the old session after posting and then call an unguarded global upsert. Switching session or root while that request is in flight lets the old full event list populate the new cache base.",
    evidence: [
      {
        path: "packages/renderer/src/panels/right/comments/controller/useCommentPoster.ts",
        lines: "109+",
      },
      {
        path: "packages/renderer/src/panels/fileViewer/lineComment/useFileCommentPoster.ts",
        lines: "138+",
      },
      {
        path: "packages/renderer/src/state/store/eventsSlice.ts",
        lines: "39–47",
      },
    ],
  },
  {
    id: "selection-response-order",
    priority: REVIEW_PRIORITIES.p1,
    area: "Selected session",
    title: "Rapid session selections are not request-sequenced",
    summary:
      "A slow selection-A response can finish after selection B and replace B's participant and registry state. A's finally block can also clear B's switching indicator.",
    evidence: [
      {
        path: "packages/renderer/src/panels/sessions/useSessionSelection.ts",
        lines: "76+",
      },
    ],
  },
  {
    id: "warm-cache-no-cursor",
    priority: REVIEW_PRIORITIES.p1,
    area: "Event sync",
    title: "A warm cache with no cursor silently stops live refresh",
    summary:
      "Incremental refresh returns immediately when the cursor is absent, while the warm-cache branch refuses a full load. Fork handling creates this state by clearing the source cursor without clearing its event base.",
    evidence: [
      {
        path: "packages/renderer/src/app/AppSocketController.ts",
        lines: "251, 425–501",
      },
    ],
  },
  {
    id: "global-consumer-cursor",
    priority: REVIEW_PRIORITIES.p1,
    area: "Event sync",
    title: "All-session incremental reads share one global consumer cursor",
    summary:
      "Two windows with the same filter race on one persisted cursor. The first request advances it, and the second can receive no delta even though both windows received the WebSocket notification.",
    evidence: [
      {
        path: "packages/kernel/src/routes/sessions/eventsService.ts",
        lines: "270–320, 394–400",
      },
      {
        path: "packages/kernel/src/state/globalConfig.ts",
        lines: "8–29",
      },
      {
        path: "packages/renderer/src/panels/allSessions.ts",
        lines: "189–260",
      },
    ],
  },
  {
    id: "cross-root-ui-actions",
    priority: REVIEW_PRIORITIES.p1,
    area: "Multi-root scope",
    title: "Cross-root fork and ordinary terminal refresh use the wrong root",
    summary:
      "Fork completion makes unscoped list and status requests. The ordinary terminal follows the global active root while visible session selection is tab-local, so a repository-B view can operate repository A.",
    evidence: [
      {
        path: "packages/renderer/src/components/forkSessionPopover/actions.ts",
        lines: "77+",
      },
      {
        path: "packages/renderer/src/shell/rightPanel/useRightTerminalController.ts",
        lines: "29+",
      },
      {
        path: "packages/renderer/src/shell/pathSwitcher/pathSwitchController.ts",
        lines: "30+",
      },
    ],
  },
  {
    id: "malformed-event",
    priority: REVIEW_PRIORITIES.p2,
    area: "Event log",
    title: "One malformed event can erase or break a session projection",
    summary:
      "Writers target the final visible filename and readers do not isolate malformed entries. One bad JSON aborts the current-session read, while all-session aggregation silently turns that session into an empty result.",
    evidence: [
      {
        path: "packages/kernel/src/events/writer.ts",
        lines: "22–58",
      },
      {
        path: "packages/kernel/src/events/reader.ts",
        lines: "19–73",
      },
      {
        path: "packages/kernel/src/routes/sessions/eventsService.ts",
        lines: "352–365",
      },
    ],
  },
  {
    id: "supersession-filter-order",
    priority: REVIEW_PRIORITIES.p2,
    area: "Event log",
    title: "Supersession is projected after consumer filters",
    summary:
      "Filtering out the tombstone kind or participant removes the information needed to hide its target. Content already removed by another event can reappear in filtered agent reads.",
    evidence: [
      {
        path: "packages/kernel/src/events/visible.ts",
        lines: "23–30",
      },
      {
        path: "packages/kernel/src/events/reader.ts",
        lines: "47–73",
      },
      { path: "packages/shared/src/events.ts", lines: "84–103" },
    ],
  },
  {
    id: "history-scan-cost",
    priority: REVIEW_PRIORITIES.p2,
    area: "Event sync",
    title: "Polling and refresh cost grow with history and event rate",
    summary:
      "Codex rereads a growing rollout every second and scans full session history twice per entry. Each event-added notification can trigger another HTTP scan, full merge sort, and feed aggregation.",
    evidence: [
      {
        path: "packages/kernel/src/services/codexRolloutLiveText.ts",
        lines: "151–196",
      },
      {
        path: "packages/kernel/src/routes/managedAgents/codexLiveTextPolling.ts",
        lines: "236–278",
      },
      {
        path: "packages/renderer/src/app/AppSocketController.ts",
        lines: "219–224",
      },
    ],
  },
  {
    id: "diff-tab-cold-load",
    priority: REVIEW_PRIORITIES.p2,
    area: "File diffs",
    title: "The diff projection is cold and tab-owned",
    summary:
      "RightDiffTree owns its changed-files response in component state and starts the request from its mount effect. Selecting the Diff tab therefore pays the git calculation and full-tree filtering cost before useful content appears, and the result is discarded when that surface unmounts.",
    evidence: [
      {
        path: "packages/renderer/src/panels/right/RightDiffTree.tsx",
        lines: "140–178",
      },
      {
        path: "packages/renderer/src/panels/right/RightDiffTree.tsx",
        lines: "221–280",
      },
      {
        path: "packages/renderer/src/panels/right/files/loadGitChangedFiles.ts",
        lines: "17–64",
      },
    ],
  },
  {
    id: "eager-whole-file-tree",
    priority: REVIEW_PRIORITIES.p2,
    area: "File tree",
    title: "The file tree eagerly walks and transfers the whole repository",
    summary:
      "The server performs a breadth-first recursive walk with per-entry metadata before returning anything. The renderer caches only the completed in-memory root response, so reloads lose it and refreshes rebuild the entire tree instead of invalidating and loading touched directories layer by layer.",
    evidence: [
      {
        path: "packages/kernel/src/routes/filesTree.ts",
        lines: "114–239",
      },
      {
        path: "packages/renderer/src/panels/right/files/filesTreeLoader.ts",
        lines: "5–48",
      },
      {
        path: "packages/renderer/src/app/useFilesTreePreload.ts",
        lines: "10–48",
      },
    ],
  },
  {
    id: "stale-project-registry",
    priority: REVIEW_PRIORITIES.p2,
    area: "Project registry",
    title: "Startup can recreate deleted registered project directories",
    summary:
      "Every registry string is initialized without an existence check, and recursive mkdir can recreate a deleted project and seed F-Mark state. One failing root also aborts synchronization of every later root.",
    evidence: [
      { path: "packages/kernel/src/index.ts", lines: "279–308" },
      { path: "packages/kernel/src/project.ts", lines: "67–77" },
      {
        path: "packages/kernel/src/paths/registry.ts",
        lines: "6–44",
      },
    ],
  },
  {
    id: "secondary-action-races",
    priority: REVIEW_PRIORITIES.p2,
    area: "User actions",
    title: "Draft, choices, stop, and restart have secondary semantic races",
    summary:
      "Draft text can follow the person into another session, rapid multi-choice clicks lose prior picks, Stop interrupts idle peers too, and kernel restart reports ready without proving an outage and recovery.",
    evidence: [
      {
        path: "packages/renderer/src/compose/useComposeTextDraft.ts",
        lines: "57+",
      },
      {
        path: "packages/renderer/src/cards/choicesCard/useChoicesCardModel.ts",
        lines: "55–107",
      },
      {
        path: "packages/renderer/src/compose/useComposeAgentControls.ts",
        lines: "94–130",
      },
      {
        path: "packages/renderer/src/app/useKernelRestart.ts",
        lines: "17–59",
      },
    ],
  },
  {
    id: "inflight-refresh-drop",
    priority: REVIEW_PRIORITIES.p2,
    area: "File sync",
    title: "File-tree and git invalidations are dropped during a refresh",
    summary:
      "A forced refresh returns the old in-flight promise without scheduling a follow-up. If a file change lands after that request captured its snapshot, no later invalidation is guaranteed.",
    evidence: [
      {
        path: "packages/renderer/src/panels/right/files/filesTreeLoader.ts",
        lines: "27+",
      },
      {
        path: "packages/renderer/src/panels/right/files/loadGitChangedFiles.ts",
        lines: "21+",
      },
    ],
  },
  {
    id: "creation-races",
    priority: REVIEW_PRIORITIES.p2,
    area: "File-backed state",
    title: "Parallel participant and session creation use read-before-create races",
    summary:
      "Two different-runtime spawns can drop one participant from the registry. Two same-slug requests can both return the same session id because existence checking and directory creation are not one commit.",
    evidence: [
      {
        path: "packages/kernel/src/participants/service.ts",
        lines: "104–129",
      },
      {
        path: "packages/kernel/src/participants/store.ts",
        lines: "51–89",
      },
      { path: "packages/kernel/src/sessions.ts", lines: "84–150" },
    ],
  },
  {
    id: "fork-snapshot-gap",
    priority: REVIEW_PRIORITIES.p2,
    area: "Session lifecycle",
    title: "Fork is not a point-in-time snapshot",
    summary:
      "Fork records entry count and source head, then copies a still-live directory without a cutoff. Concurrent event or bundle writes can make the metadata disagree with the copied content.",
    evidence: [
      { path: "packages/kernel/src/sessions.ts", lines: "187–236" },
    ],
  },
  {
    id: "shallow-event-types",
    priority: REVIEW_PRIORITIES.p3,
    area: "Contracts",
    title: "The event type interface defeats its own narrowing",
    summary:
      "The event union ends with a catch-all generic record, leaving route schemas, MCP schemas, docs, and projections to drift independently and forcing hundreds of payload casts across the renderer and kernel.",
    evidence: [
      { path: "packages/shared/src/events.ts", lines: "229–235, 515–530" },
      {
        path: "packages/kernel/src/routes/events/schemas.ts",
        lines: "50+",
      },
      {
        path: "packages/kernel/src/mcp/tools/writeEventToolGroup.ts",
        lines: "31+",
      },
    ],
  },
  {
    id: "errors-as-success",
    priority: REVIEW_PRIORITIES.p3,
    area: "Failure states",
    title: "Errors frequently present as empty or stale success",
    summary:
      "Bootstrap and event failures collapse into empty collections or stale views, lazy subtree failure renders nothing, and lifecycle reconciliation suppresses exceptions before returning event-write success.",
    evidence: [
      {
        path: "packages/renderer/src/app/useAppBootstrap.ts",
        lines: "38+",
      },
      {
        path: "packages/renderer/src/app/useSessionEvents.ts",
        lines: "275+",
      },
      {
        path: "packages/renderer/src/components/LazyBoundary.tsx",
        lines: "22+",
      },
      {
        path: "packages/kernel/src/routes/events/scopedWrite.ts",
        lines: "55–65",
      },
    ],
  },
  {
    id: "false-green-gates",
    priority: REVIEW_PRIORITIES.p3,
    area: "Verification",
    title: "CI and the “real UI” label overstate coverage",
    summary:
      "CI filters for the nonexistent package name kernel, prints “No projects matched,” and exits 0. The default browser suite starts only Vite and intercepts every backend request, so it cannot detect real REST, WebSocket, file, tmux, or packaging drift.",
    evidence: [
      { path: ".github/workflows/ci.yml", lines: "20–24" },
      { path: "packages/kernel/package.json", lines: "1–3" },
      { path: "playwright.config.ts", lines: "20–27" },
      {
        path: "tests/e2e/real-ui-smoke.spec.ts",
        lines: "173–316",
      },
    ],
  },
] as const;

export const ARCHITECTURE_CANDIDATES: readonly ArchitectureCandidate[] = [
  {
    id: "turn-lifecycle",
    rank: "01",
    title: "Deepen the turn-lifecycle module",
    strength: "Strong",
    problem:
      "Closure, activity, attribution, stop, poller publication, and file-backed control state are independent implementations with different ordering rules.",
    direction:
      "One deep implementation should own phase and run identity, attribution, serialized transitions, terminal closure, and recoverable publication. Hooks, MCP/REST, tmux, polling, and renderer activity become adapters at one seam.",
    benefits:
      "The highest user-trust leverage: stopped and done become terminal by construction, transition tests gain locality, and publication retry no longer mutates its cursor first.",
    files: [
      "hooks/autoStream/AutoStreamRunner.ts",
      "hooks/autoStream/dedupe.ts",
      "routes/events/scopedWrite.ts",
      "services/agentState.ts",
      "routes/managedAgents/codexLiveTextPolling.ts",
    ],
  },
  {
    id: "root-runtime",
    rank: "02",
    title: "Make root-bound runtime supervision the scope seam",
    strength: "Strong",
    problem:
      "A request can resolve a background root and later bypass it through global active-root context. Watchers and reconciliation are still single-root implementations.",
    direction:
      "A deep root-runtime implementation owns paths, runtime registry, agent state, tmux namespace, watchers, pollers, reconcile, and disposal. Launch, reconnect, fork, terminal, and startup remain adapters.",
    benefits:
      "One ownership rule repairs background spawn, fork, terminal, restart, and file invalidation with strong test locality.",
    files: [
      "managedAgents/launchService.ts",
      "sessions/forkService.ts",
      "runtimes/store.ts",
      "reconcile/StartupReconciler.ts",
      "services/filesWatcher.ts",
    ],
  },
  {
    id: "event-log-sync",
    rank: "03",
    title: "Deepen the event-log and event-sync modules",
    strength: "Strong",
    problem:
      "Append, visible projection, cursors, supersession, fork copy, invalidation, merge, and selection applicability are shallow and separately owned.",
    direction:
      "The file-side module owns committed append, validation isolation, visible projection, delta identity, and snapshot cutoff. A paired renderer module owns scoped cache identity, coalescing, cursor recovery, request epochs, and surfaced failure.",
    benefits:
      "Malformed records become local failures, filtered supersession becomes correct, and live refresh stops doing full work for every event.",
    files: [
      "events/writer.ts",
      "events/reader.ts",
      "events/visible.ts",
      "sessions/eventsService.ts",
      "app/AppSocketController.ts",
      "state/sessionEventsCursor.ts",
    ],
  },
  {
    id: "protocol-surface",
    rank: "04",
    title: "Generate one agent-protocol implementation",
    strength: "Strong",
    problem:
      "AGENT guides, runtime skills, API notes, route schemas, shared types, and MCP guidance are independently edited and already disagree on comments and Codex setup.",
    direction:
      "One versioned protocol description becomes authoritative. Documentation and validation adapters derive from it, while project guidance gets an explicit refresh and migration path.",
    benefits:
      "High leverage at relatively low conceptual cost: no silent semantic drift and no permanently stale installed guide.",
    files: [
      "assets/AGENT.md",
      "assets/*-skill/f-mark/SKILL.md",
      "routes/events/schemas.ts",
      "routes/guide/mcpGuide/body.ts",
      "project.ts",
    ],
  },
  {
    id: "file-workspace",
    rank: "05",
    title: "Deepen the file-workspace module",
    strength: "Strong",
    problem:
      "Editor buffer, autosave, diff projection, directory tree, comments, modification time, watcher, and git cache have no shared owner for freshness, reuse, or navigation invariants.",
    direction:
      "One deep implementation owns composite file identity, dirty buffers, versioned saves, cached diff indexes, lazy directory layers, invalidation generations, and the complete file-comment authoring and reveal contract.",
    benefits:
      "It removes data-loss paths, makes file and diff surfaces warm across same-root sessions, and gives file comments one end-to-end tested flow from Monaco to chat and back.",
    files: [
      "useMonacoFileText.ts",
      "routes/filesText.ts",
      "services/filesWatcher.ts",
      "app/AppSocketController.ts",
      "filesTreeLoader.ts",
    ],
  },
  {
    id: "user-action-commit",
    rank: "06",
    title: "Deepen the user-action commit module",
    strength: "Worth exploring",
    problem:
      "Compose, attachments, choices, comments, todos, turn-end, and wake duplicate multi-stage implementations with no partial-progress identity.",
    direction:
      "A deep commit implementation owns action identity, ordered stages, idempotent replay, pending and committed state, wake policy, and cleanup. Event and agent endpoints remain adapters.",
    benefits:
      "Primary interactions become resumable instead of duplicating or disappearing after late failure.",
    files: [
      "ComposeSubmissionController.ts",
      "useComposeSubmission.ts",
      "useChoicesCardModel.ts",
      "useCommentPoster.ts",
      "ComposeAttachmentUploader.ts",
    ],
  },
  {
    id: "selected-session",
    rank: "07",
    title: "Make selected-session identity composite",
    strength: "Worth exploring",
    problem:
      "Root id, root path, event base, session id, and request freshness travel separately. Persistence uses bare session id and late responses have no common applicability rule.",
    direction:
      "A deep selected-session implementation owns composite identity, persistence namespace, and selection epoch. Comments, fork, terminal, drafts, panels, and event sync consume one interface.",
    benefits:
      "Cross-root navigation gains one correctness rule and stale-response tests become local rather than feature-specific.",
    files: [
      "state/sessionPersistence.ts",
      "state/store/sessionSlice.ts",
      "state/panePersistence.ts",
      "state/fileViewerTabs.ts",
      "useSessionSelection.ts",
    ],
  },
  {
    id: "project-registry",
    rank: "08",
    title: "Deepen project-registry lifecycle",
    strength: "Worth exploring",
    problem:
      "The registry is an append-only list of strings. Startup treats each entry as live, initialization can recreate a deleted root, and forget does not remove the registry source.",
    direction:
      "A deep registry implementation owns observed, missing, forgotten, and initialized states. Startup probes without creating first and isolates failures per root.",
    benefits:
      "Startup becomes predictable and historical roots stop taxing all-session, search, watcher, and synchronization flows.",
    files: [
      "index.ts",
      "project.ts",
      "paths/registry.ts",
      "boot/activePath.ts",
      "paths/knownRoutes.ts",
    ],
  },
] as const;

export const FILE_WORKSPACE_MITIGATIONS: readonly FileWorkspaceMitigation[] = [
  {
    id: "mitigate-diff-cold-load",
    rank: "F1",
    title: "Precompute and cache the diff projection",
    issue:
      "Diff calculation currently starts when the Diff surface mounts and its result lives inside that surface.",
    mitigation:
      "Move changed-file and diff-summary loading into a root-scoped projection cache. Prewarm it after session bootstrap, retain the last good result while refreshing, key session mode by root plus session baseline, key branch mode by root plus base ref and working-tree revision, and invalidate from file/git change signals rather than tab selection.",
    acceptance: [
      "Opening Diff shows the cached projection immediately.",
      "Same-root sessions reuse branch results and only session-specific deltas vary.",
      "Refresh happens in the background without replacing useful content with a full loader.",
    ],
    files: [
      "panels/right/RightDiffTree.tsx",
      "panels/right/files/loadGitChangedFiles.ts",
      "app/useFilesTreePreload.ts",
      "app/AppSocketController.ts",
      "kernel/routes/git/hunks.ts",
    ],
  },
  {
    id: "mitigate-layered-tree",
    rank: "F2",
    title: "Load the tree one directory layer at a time",
    issue:
      "The first tree response waits for a recursive repository walk and refresh repeats the whole operation.",
    mitigation:
      "Change the tree contract to return one directory layer with child-presence metadata and a revision. Fetch children on expansion, cache directory pages by root and relative directory, share that cache across sessions on the same root, and let watcher events invalidate only touched paths and ancestors.",
    acceptance: [
      "The repository root appears without waiting for a complete walk.",
      "Expanding a directory loads only that subtree and preserves existing rows.",
      "Same-root session switches and ordinary refreshes reuse cached layers and expansion state.",
    ],
    files: [
      "kernel/routes/filesTree.ts",
      "panels/right/files/filesTreeLoader.ts",
      "panels/right/files/FileTree.tsx",
      "panels/right/files/useRightFilesController.ts",
      "services/filesWatcher.ts",
    ],
  },
  {
    id: "mitigate-monaco-comments",
    rank: "F3",
    title: "Make Monaco comments one complete file-comment flow",
    issue:
      "The plus affordance, file-prose append, thread focus, and reveal navigation exist as separate pieces and the authoring path can fail silently before opening the draft.",
    mitigation:
      "Gate the affordance and draft from the same readiness state, surface why commenting is unavailable, and drive Monaco plus, rendered-file comments, chat cards, and comment threads through one file-comment action. Submission must append prose with file_path, lines, and line_context; clicking that chat item must surface Files, activate the file tab, force source mode, select the range, and scroll it into view.",
    acceptance: [
      "Clicking + always opens a draft or displays an explicit unavailable reason.",
      "Submitting creates a normal chat item with a threaded discussion target.",
      "Clicking the chat item or thread opens the file, activates its tab, selects the range, and scrolls to it.",
      "A browser-level test proves the complete round trip.",
    ],
    files: [
      "renderers/monaco/useMonacoEditorInteractions.ts",
      "renderers/monaco/useMonacoCommentDraft.ts",
      "lineComment/useFileCommentPoster.ts",
      "lineComment/useFileCommentReveal.ts",
      "cards/FileCommentCard.tsx",
    ],
  },
] as const;

export const REVIEW_COUNTS = {
  all: REVIEW_FINDINGS.length,
  p1: REVIEW_FINDINGS.filter(
    (finding) => finding.priority === REVIEW_PRIORITIES.p1,
  ).length,
  p2: REVIEW_FINDINGS.filter(
    (finding) => finding.priority === REVIEW_PRIORITIES.p2,
  ).length,
  p3: REVIEW_FINDINGS.filter(
    (finding) => finding.priority === REVIEW_PRIORITIES.p3,
  ).length,
  tests: 2309,
  candidates: ARCHITECTURE_CANDIDATES.length,
  fileMitigations: FILE_WORKSPACE_MITIGATIONS.length,
} as const;

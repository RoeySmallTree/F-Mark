import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { RefreshCw } from "lucide-react";
import {
  DIFF_BASES,
  GIT_DIFF_MODES,
  GIT_RESPONSE_STATUSES,
  type GitDiffMode,
  type GitBranchRefsResponse,
  type GitChangedFile,
  type GitChangedFilesResponse,
  type GitFileStatus,
} from "@f-mark/shared";
import type { FilesTreeEntry, FilesTreeResponse } from "../../api/client.js";
import { createClient } from "../../api/client.js";
import { DEFAULT_FILES_SEARCH, useStore } from "../../state/store.js";
import { usePresentFile } from "../../shell/usePresentFile.js";
import { useRovingTabIndex } from "../../a11y/useRovingTabIndex.js";
import { TabEmptyState } from "./TabEmptyState.js";
import { PanelLoadingState } from "./PanelLoadingState.js";
import { FileTree } from "./files/FileTree.js";
import { buildTreeView, type FavoriteScope } from "./files/buildTreeView.js";
import {
  loadScopeForSelectedRoot,
  resolveSelectedRoot,
} from "./files/useRightFilesController/rootScope.js";
import { useFilesTreeLoad } from "./files/useRightFilesController/useFilesLoadingEffects.js";

type DiffTreeMode = GitDiffMode;

interface DiffTreeState {
  loading: boolean;
  error: string | null;
  response: GitChangedFilesResponse | null;
}

const EMPTY_CHANGED: Record<string, GitFileStatus> = {};

const diffTreeModes = {
  session: GIT_DIFF_MODES.session,
  branch: GIT_DIFF_MODES.branch,
} as const satisfies Record<string, DiffTreeMode>;

const DIFF_TREE_MODE_ORDER: DiffTreeMode[] = [
  diffTreeModes.session,
  diffTreeModes.branch,
];

const diffTreeRefs = {
  head: "HEAD",
} as const;

const diffTreeChromeHeights = {
  branch: "72px",
  session: "35px",
} as const;

const diffTreeClassNames = {
  active: "is-on",
  spinning: "is-spinning",
  empty: "",
} as const;

const NO_LOOSE_STRING_VALUES = {
  diffNoPath: "diff-no-path",
  diffNoGit: "diff-no-git",
  diffTreeClean: "diff-tree-clean",
} as const;

const statusClassTokens = {
  binaryPrefix: "binary-",
  deleted: "deleted",
} as const;

function statusMap(files: GitChangedFile[]): Record<string, GitFileStatus> {
  const map: Record<string, GitFileStatus> = {};
  for (const file of files) {
    map[file.rel_path] = file.status;
  }
  return map;
}

function joinRoot(root: string, rel: string): string {
  return `${root.replace(/\/+$/, "")}/${rel}`;
}

function uniqueRefs(refs: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const ref of refs) {
    if (ref === undefined || ref === null) continue;
    const trimmed = ref.trim();
    if (trimmed.length === 0) continue;
    seen.add(trimmed);
  }
  return [...seen];
}

function changedTree(
  tree: FilesTreeResponse | null | undefined,
  changedByRelPath: Record<string, GitFileStatus>,
): FilesTreeResponse | null {
  if (tree === null || tree === undefined) return null;
  const changed = new Set(Object.keys(changedByRelPath));
  const keep = new Set<number>();
  for (const entry of tree.entries) {
    if (entry.isDir || !changed.has(entry.relPath)) continue;
    keep.add(entry.index);
    let parent = entry.parent;
    while (parent !== null) {
      keep.add(parent);
      parent = tree.entries[parent]?.parent ?? null;
    }
  }
  const oldToNew = new Map<number, number>();
  const entries: FilesTreeEntry[] = [];
  for (const entry of tree.entries) {
    if (!keep.has(entry.index)) continue;
    oldToNew.set(entry.index, entries.length);
    entries.push(entry);
  }
  return {
    ...tree,
    entries: entries.map((entry, index) => ({
      ...entry,
      index,
      parent:
        entry.parent === null ? null : (oldToNew.get(entry.parent) ?? null),
    })),
    truncated: false,
  };
}

function expandedForTree(tree: FilesTreeResponse | null): Record<string, true> {
  if (tree === null) return {};
  const expanded: Record<string, true> = {};
  for (const entry of tree.entries) {
    if (entry.isDir) expanded[entry.relPath] = true;
  }
  return expanded;
}

export function RightDiffTree(): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const selectedPath = useStore((s) => s.selectedPath);
  const selectedPathId = useStore((s) => s.selectedPathId);
  const activePath = useStore((s) => s.activePath);
  const activePathId = useStore((s) => s.activePathId);
  const selectedRoot = useMemo(
    () =>
      resolveSelectedRoot({
        selectedPath,
        selectedPathId,
        activePath,
        activePathId,
      }),
    [activePath, activePathId, selectedPath, selectedPathId],
  );
  const currentSessionId = useStore((s) => s.currentSessionId);
  const tree = useStore((s) =>
    selectedRoot.path !== null ? s.filesTreeByPath[selectedRoot.path] : null,
  );
  const treeLoading = useStore((s) =>
    selectedRoot.path !== null
      ? s.filesTreeLoadingByPath[selectedRoot.path] === true
      : false,
  );
  const setFileViewerDiff = useStore((s) => s.setFileViewerDiff);
  const presentFile = usePresentFile();
  const [mode, setMode] = useState<DiffTreeMode>(diffTreeModes.session);
  const [baseRef, setBaseRef] = useState<string | null>(null);
  const [refs, setRefs] = useState<GitBranchRefsResponse | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, true>>({});
  const [state, setState] = useState<DiffTreeState>({
    loading: false,
    error: null,
    response: null,
  });
  const modeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const modeIndex = DIFF_TREE_MODE_ORDER.indexOf(mode);
  const { tabIndexFor: modeTabIndexFor, onKeyDown: onModeKeyDown } =
    useRovingTabIndex(
      DIFF_TREE_MODE_ORDER.length,
      modeIndex < 0 ? 0 : modeIndex,
      (index) => {
        const next = DIFF_TREE_MODE_ORDER[index];
        if (next === undefined) return;
        setMode(next);
        modeButtonRefs.current[index]?.focus();
      },
    );

  useFilesTreeLoad(client, selectedRoot);

  const scope = useMemo(
    () => loadScopeForSelectedRoot(selectedRoot),
    [selectedRoot],
  );
  const branchBaseRef =
    baseRef ??
    refs?.current_ref ??
    refs?.detected_base_ref ??
    diffTreeRefs.head;
  const branchOptions = useMemo(
    () =>
      uniqueRefs([
        refs?.current_ref,
        diffTreeRefs.head,
        refs?.detected_base_ref,
        ...(refs?.refs ?? []),
      ]),
    [refs],
  );

  useEffect(() => {
    setBaseRef(null);
    setCollapsed({});
  }, [selectedRoot.path, selectedRoot.pathId]);

  useEffect(() => {
    if (scope === null) {
      setRefs(null);
      return;
    }
    let cancelled = false;
    client
      .gitBranchRefs(scope)
      .then((response) => {
        if (!cancelled) setRefs(response);
      })
      .catch(() => {
        if (!cancelled) setRefs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, scope]);

  const loadChanged = useCallback((): void => {
    if (scope === null) {
      setState({ loading: false, error: null, response: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const request =
      mode === diffTreeModes.session
        ? {
            scope,
            mode: diffTreeModes.session,
            ...(currentSessionId !== null
              ? { sessionId: currentSessionId }
              : {}),
          }
        : {
            scope,
            mode: diffTreeModes.branch,
            base: branchBaseRef,
          };
    void client
      .gitChangedFiles(request)
      .then((response) => {
        setState({ loading: false, error: null, response });
      })
      .catch((err: unknown) => {
        setState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          response: null,
        });
      });
  }, [branchBaseRef, client, currentSessionId, mode, scope]);

  useEffect(() => {
    loadChanged();
  }, [loadChanged]);

  const changedByRelPath = useMemo(
    () =>
      state.response === null ? EMPTY_CHANGED : statusMap(state.response.files),
    [state.response],
  );
  const filteredTree = useMemo(
    () => changedTree(tree, changedByRelPath),
    [changedByRelPath, tree],
  );
  const expanded = useMemo(() => {
    const all = expandedForTree(filteredTree);
    for (const relPath of Object.keys(collapsed)) delete all[relPath];
    return all;
  }, [collapsed, filteredTree]);
  const view = useMemo(
    () =>
      buildTreeView(
        filteredTree,
        expanded,
        DEFAULT_FILES_SEARCH,
        new Set(),
        new Set(),
      ),
    [expanded, filteredTree],
  );

  const onOpenFile = useCallback(
    (absPath: string): void => {
      presentFile(absPath);
      setFileViewerDiff(absPath, {
        mode:
          mode === diffTreeModes.session
            ? DIFF_BASES.currentSession
            : DIFF_BASES.wholeBranch,
        baseRef: mode === diffTreeModes.branch ? branchBaseRef : null,
      });
    },
    [branchBaseRef, mode, presentFile, setFileViewerDiff],
  );

  if (selectedRoot.path === null) {
    return <TabEmptyState variant={NO_LOOSE_STRING_VALUES.diffNoPath} fill />;
  }

  const notGit =
    state.response?.status === GIT_RESPONSE_STATUSES.notGit ||
    refs?.status === GIT_RESPONSE_STATUSES.notGit;

  return (
    <div
      className="files-pane diff-tree-pane"
      style={
        {
          "--files-chrome-h":
            mode === diffTreeModes.branch
              ? diffTreeChromeHeights.branch
              : diffTreeChromeHeights.session,
        } as CSSProperties
      }
    >
      <div className="files-header diff-tree-header">
        <div
          className="diff-tree-segment"
          role="tablist"
          aria-label="Diff tree mode"
          onKeyDown={onModeKeyDown}
        >
          <button
            type="button"
            ref={(el) => {
              modeButtonRefs.current[0] = el;
            }}
            role="tab"
            aria-selected={mode === diffTreeModes.session}
            tabIndex={modeTabIndexFor(0)}
            className={
              mode === diffTreeModes.session
                ? diffTreeClassNames.active
                : diffTreeClassNames.empty
            }
            onClick={() => setMode(diffTreeModes.session)}
          >
            This session
          </button>
          <button
            type="button"
            ref={(el) => {
              modeButtonRefs.current[1] = el;
            }}
            role="tab"
            aria-selected={mode === diffTreeModes.branch}
            tabIndex={modeTabIndexFor(1)}
            className={
              mode === diffTreeModes.branch
                ? diffTreeClassNames.active
                : diffTreeClassNames.empty
            }
            onClick={() => setMode(diffTreeModes.branch)}
          >
            This branch
          </button>
        </div>
        <button
          type="button"
          className="files-header-btn"
          onClick={loadChanged}
          title="Refresh diff tree"
          aria-label="Refresh diff tree"
        >
          <RefreshCw
            size={13}
            aria-hidden
            className={
              state.loading
                ? diffTreeClassNames.spinning
                : diffTreeClassNames.empty
            }
          />
        </button>
      </div>
      {mode === diffTreeModes.branch ? (
        <div className="diff-tree-refs">
          <select
            value={branchBaseRef}
            onChange={(event) => setBaseRef(event.currentTarget.value)}
            aria-label="Compare branch"
            disabled={notGit}
          >
            {branchOptions.map((ref) => (
              <option key={ref} value={ref}>
                {ref}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {state.error !== null ? (
        <div className="files-truncated">
          Could not load diff tree: {state.error}
        </div>
      ) : null}
      {notGit ? (
        <TabEmptyState variant={NO_LOOSE_STRING_VALUES.diffNoGit} fill />
      ) : state.loading && state.response === null ? (
        <PanelLoadingState label="Loading diff…" />
      ) : treeLoading && tree === null ? (
        <PanelLoadingState label="Loading tree…" />
      ) : (
        <>
          <FileTree
            rows={view.rows}
            emptyVariant={NO_LOOSE_STRING_VALUES.diffTreeClean}
            onToggleFolder={(relPath) =>
              setCollapsed((current) => {
                const next = { ...current };
                if (next[relPath] === true) delete next[relPath];
                else next[relPath] = true;
                return next;
              })
            }
            onCycleFav={noopCycleFav}
            changedByRelPath={changedByRelPath}
            onOpenFile={onOpenFile}
          />
          <DiffAbsentFiles
            root={selectedRoot.path}
            files={state.response?.files ?? []}
            tree={tree}
            onOpenFile={onOpenFile}
          />
        </>
      )}
    </div>
  );
}

function noopCycleFav(_absPath: string, _current: FavoriteScope): void {
  /* Diff tree is filtered by change status; favorite state belongs to Files. */
}

function DiffAbsentFiles({
  root,
  files,
  tree,
  onOpenFile,
}: {
  root: string;
  files: GitChangedFile[];
  tree: FilesTreeResponse | null | undefined;
  onOpenFile(absPath: string): void;
}): JSX.Element | null {
  const present = useMemo(() => {
    const set = new Set<string>();
    for (const entry of tree?.entries ?? []) {
      if (!entry.isDir) set.add(entry.relPath);
    }
    return set;
  }, [tree]);
  const rows = files
    .filter((file) => !present.has(file.rel_path))
    .map((file) => ({
      rel: file.rel_path,
      status: file.status,
      openAbs: joinRoot(root, file.rel_path),
    }));

  if (rows.length === 0) return null;

  return (
    <div className="files-changed-absent" data-testid="diff-tree-absent">
      <div className="files-changed-absent-title">Changed outside tree</div>
      {rows.map((row) => (
        <button
          key={row.rel}
          type="button"
          className={`files-changed-absent-row is-${row.status.replace(statusClassTokens.binaryPrefix, "")}`}
          title={`${row.status}: ${row.rel}`}
          onClick={() => onOpenFile(row.openAbs)}
        >
          <span className="files-changed-absent-name">{row.rel}</span>
          <span className="files-changed-absent-badge">
            {row.status.includes(statusClassTokens.deleted) ? "D" : "R"}
          </span>
        </button>
      ))}
    </div>
  );
}

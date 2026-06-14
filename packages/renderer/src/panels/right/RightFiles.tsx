import { useCallback, useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { createClient } from "../../api/client.js";
import {
  useStore,
  DEFAULT_FILE_VIEWER_LAYOUT,
  FILE_VIEWER_LOWER_DEFAULT_R,
} from "../../state/store.js";
import { buildTreeView, type FavoriteScope } from "./files/buildTreeView.js";
import { FileTree } from "./files/FileTree.js";
import { FilesSearch } from "./files/FilesSearch.js";
import { FilesSearchChips } from "./files/FilesSearchChips.js";
import { LowerShell, LowerResizer } from "../fileViewer/shells/LowerShell.js";

export function RightFiles(): JSX.Element {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  const currentSessionId = useStore((s) => s.currentSessionId);

  const treeByPath = useStore((s) => s.filesTreeByPath);
  const loadingByPath = useStore((s) => s.filesTreeLoadingByPath);
  const expandedByPath = useStore((s) => s.filesExpandedByPath);
  const favProjectByPath = useStore((s) => s.filesFavoritesProjectByPath);
  const favSessionAll = useStore((s) => s.filesFavoritesSession);
  const search = useStore((s) => s.filesSearch);

  const toggleFilesFolder = useStore((s) => s.toggleFilesFolder);
  const setFilesFavoritesProject = useStore((s) => s.setFilesFavoritesProject);
  const setFilesFavoritesSession = useStore((s) => s.setFilesFavoritesSession);
  const resetFilesSearch = useStore((s) => s.resetFilesSearch);

  const [searchOpen, setSearchOpen] = useState(false);

  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );

  const tree = activePath !== null ? (treeByPath[activePath] ?? null) : null;
  const loading = activePath !== null ? loadingByPath[activePath] === true : false;
  const expanded =
    activePath !== null ? (expandedByPath[activePath] ?? {}) : {};
  const projectFavs =
    activePath !== null ? (favProjectByPath[activePath] ?? []) : [];
  const sessionFavs =
    currentSessionId !== null ? (favSessionAll[currentSessionId] ?? []) : [];

  /* Fetch project favorites whenever activePath changes. */
  useEffect(() => {
    if (activePath === null) return;
    let cancelled = false;
    client
      .fetchFilesFavorites("project")
      .then((res) => {
        if (cancelled) return;
        setFilesFavoritesProject(activePath, res.paths);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("fetchFilesFavorites(project) failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, client, setFilesFavoritesProject]);

  /* Fetch session favorites whenever currentSessionId changes. */
  useEffect(() => {
    if (currentSessionId === null) return;
    let cancelled = false;
    client
      .fetchFilesFavorites("session", currentSessionId)
      .then((res) => {
        if (cancelled) return;
        setFilesFavoritesSession(currentSessionId, res.paths);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("fetchFilesFavorites(session) failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, client, setFilesFavoritesSession]);

  const sessionFavSet = useMemo(() => new Set(sessionFavs), [sessionFavs]);
  const projectFavSet = useMemo(() => new Set(projectFavs), [projectFavs]);

  const view = useMemo(
    () => buildTreeView(tree, expanded, search, sessionFavSet, projectFavSet),
    [tree, expanded, search, sessionFavSet, projectFavSet],
  );

  const onToggleFolder = useCallback(
    (relPath: string): void => {
      if (activePath === null) return;
      toggleFilesFolder(activePath, relPath);
    },
    [activePath, toggleFilesFolder],
  );

  const cycleFav = useCallback(
    async (absPath: string, current: FavoriteScope): Promise<void> => {
      if (activePath === null) return;
      try {
        if (current === null) {
          /* none → session */
          if (currentSessionId === null) return;
          const res = await client.addFilesFavorite({
            scope: "session",
            sessionId: currentSessionId,
            path: absPath,
          });
          setFilesFavoritesSession(currentSessionId, res.paths);
        } else if (current === "session") {
          /* session → project: remove from session, add to project */
          if (currentSessionId !== null) {
            const sres = await client.removeFilesFavorite({
              scope: "session",
              sessionId: currentSessionId,
              path: absPath,
            });
            setFilesFavoritesSession(currentSessionId, sres.paths);
          }
          const pres = await client.addFilesFavorite({
            scope: "project",
            path: absPath,
          });
          setFilesFavoritesProject(activePath, pres.paths);
        } else {
          /* project → none */
          const pres = await client.removeFilesFavorite({
            scope: "project",
            path: absPath,
          });
          setFilesFavoritesProject(activePath, pres.paths);
        }
      } catch (err) {
        console.error("cycleFav failed", err);
      }
    },
    [
      activePath,
      client,
      currentSessionId,
      setFilesFavoritesProject,
      setFilesFavoritesSession,
    ],
  );

  /* Layout for this project decides whether to wrap the tree in a
     vertical split (lower mode) or render it edge-to-edge as before. */
  const fileViewerLayout = useStore((s) =>
    activePath !== null
      ? (s.fileViewerLayoutByPath[activePath] ??
        DEFAULT_FILE_VIEWER_LAYOUT)
      : DEFAULT_FILE_VIEWER_LAYOUT,
  );
  const lowerRatio = useStore((s) =>
    currentSessionId !== null
      ? (s.fileViewerLowerRatioBySession[currentSessionId] ??
        FILE_VIEWER_LOWER_DEFAULT_R)
      : FILE_VIEWER_LOWER_DEFAULT_R,
  );

  if (activePath === null) {
    return (
      <div className="files-empty">
        Pick a project path to browse its files.
      </div>
    );
  }

  /* Chips appear only when a query is typed or chips are already selected —
     otherwise extsInMatches would dump every extension in the tree, which
     is noise without a filter active. */
  const filterActive = search.q.length > 0 || search.exts.length > 0;
  const chipsVisible =
    searchOpen && filterActive && view.extsInMatches.length > 0;
  const chromeHeight =
    35 + (searchOpen ? 37 : 0) + (chipsVisible ? 34 : 0);

  const isLower = fileViewerLayout === "lower";
  const topFlex = isLower
    ? { flex: `0 0 ${Math.round(lowerRatio * 100)}%`, minHeight: 0 }
    : undefined;

  const paneContents = (
    <>
      <div className="files-header">
        <button
          type="button"
          className={`files-header-btn ${searchOpen ? "is-on" : ""}`}
          onClick={() => setSearchOpen((v) => !v)}
          title={searchOpen ? "Hide search" : "Search files"}
          aria-pressed={searchOpen}
        >
          <SearchIcon size={13} aria-hidden />
        </button>
        {(search.q.length > 0 || search.exts.length > 0) && (
          <button
            type="button"
            className="files-header-btn"
            onClick={resetFilesSearch}
            title="Clear filter"
          >
            <X size={13} aria-hidden />
          </button>
        )}
      </div>
      {searchOpen && (
        <FilesSearch
          search={search}
          searchValid={view.searchValid}
          autoFocus={searchOpen}
        />
      )}
      {chipsVisible && (
        <FilesSearchChips exts={view.extsInMatches} selected={search.exts} />
      )}
      {view.truncated && (
        <div className="files-truncated">
          tree truncated — refine search to narrow results
        </div>
      )}
      {loading && tree === null ? (
        <div className="files-loading">loading…</div>
      ) : (
        <FileTree
          rows={view.rows}
          onToggleFolder={onToggleFolder}
          onCycleFav={cycleFav}
        />
      )}
    </>
  );

  if (isLower) {
    return (
      <div
        className="files-pane fv-lower"
        style={{ "--files-chrome-h": `${chromeHeight}px` } as React.CSSProperties}
      >
        <div className="files-pane-top" style={topFlex}>
          {paneContents}
        </div>
        <LowerResizer />
        <div className="files-pane-bottom" style={{ flex: 1, minHeight: 0 }}>
          <LowerShell />
        </div>
      </div>
    );
  }

  return (
    <div
      className="files-pane"
      style={{ "--files-chrome-h": `${chromeHeight}px` } as React.CSSProperties}
    >
      {paneContents}
    </div>
  );
}

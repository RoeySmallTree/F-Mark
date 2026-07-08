import { useMemo } from "react";
import type { FilesSearchState } from "../../../../state/store.js";
import type { State } from "../../../../state/storeTypes.js";
import { buildTreeView, type TreeView } from "../buildTreeView.js";

const EMPTY_EXPANDED: Record<string, true> = {};
const EMPTY_FAVORITES: string[] = [];

interface FilesTreeViewState {
  loading: boolean;
  treeLoaded: boolean;
  view: TreeView;
  filterActive: boolean;
  chipsVisible: boolean;
  chromeHeight: number;
}

export function useFilesTreeViewState(input: {
  selectedPath: string | null;
  currentSessionId: string | null;
  treeByPath: State["filesTreeByPath"];
  loadingByPath: State["filesTreeLoadingByPath"];
  expandedByPath: State["filesExpandedByPath"];
  favProjectByPath: State["filesFavoritesProjectByPath"];
  favSessionAll: State["filesFavoritesSession"];
  search: FilesSearchState;
  searchOpen: boolean;
}): FilesTreeViewState {
  const {
    selectedPath,
    currentSessionId,
    treeByPath,
    loadingByPath,
    expandedByPath,
    favProjectByPath,
    favSessionAll,
    search,
    searchOpen,
  } = input;
  const tree = valueBySelectedPath(selectedPath, treeByPath, null);
  const loading = loadingForSelectedPath(selectedPath, loadingByPath);
  const expanded = valueBySelectedPath(
    selectedPath,
    expandedByPath,
    EMPTY_EXPANDED,
  );
  const projectFavs = valueBySelectedPath(
    selectedPath,
    favProjectByPath,
    EMPTY_FAVORITES,
  );
  const sessionFavs = favoritesForSession(currentSessionId, favSessionAll);
  const sessionFavSet = useMemo(() => new Set(sessionFavs), [sessionFavs]);
  const projectFavSet = useMemo(() => new Set(projectFavs), [projectFavs]);
  const view = useMemo(
    () => buildTreeView(tree, expanded, search, sessionFavSet, projectFavSet),
    [tree, expanded, search, sessionFavSet, projectFavSet],
  );

  const filterActive = search.q.length > 0 || search.exts.length > 0;
  const chipsVisible =
    searchOpen && filterActive && view.extsInMatches.length > 0;
  return {
    loading,
    treeLoaded: tree !== null,
    view,
    filterActive,
    chipsVisible,
    chromeHeight: 35 + (searchOpen ? 37 : 0) + (chipsVisible ? 34 : 0),
  };
}

function valueBySelectedPath<T>(
  selectedPath: string | null,
  valuesByPath: Record<string, T>,
  fallback: T,
): T {
  if (selectedPath === null) return fallback;
  return valuesByPath[selectedPath] ?? fallback;
}

function loadingForSelectedPath(
  selectedPath: string | null,
  loadingByPath: State["filesTreeLoadingByPath"],
): boolean {
  return selectedPath !== null && loadingByPath[selectedPath] === true;
}

function favoritesForSession(
  currentSessionId: string | null,
  favSessionAll: State["filesFavoritesSession"],
): string[] {
  if (currentSessionId === null) return EMPTY_FAVORITES;
  return favSessionAll[currentSessionId] ?? EMPTY_FAVORITES;
}

import type {
  FilesTreeEntry,
  FilesTreeResponse,
} from "../../../api/client.js";
import type { FilesSearchState } from "../../../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  session: "session",
  project: "project",
} as const;

export type FavoriteScope = "session" | "project" | null;

export type TreeViewEntry = FilesTreeEntry & { absPath: string };

/* A node in the visible tree. Folders carry their visible children
   inline so the renderer can wrap each folder + its descendants in a
   single DOM section — that section is what makes the sticky folder
   header naturally scroll out when its subtree ends, instead of
   stacking under the next folder's header. Files always have an empty
   `children` array. */
export interface VisibleRow {
  entry: TreeViewEntry;
  isOpen: boolean;
  hasChildren: boolean;
  fav: FavoriteScope;
  children: VisibleRow[];
}

export interface TreeView {
  /* Root-level rows only — folders carry descendants in `children`. */
  rows: VisibleRow[];
  /* Distinct lowercase extensions present in the *unfiltered-by-chips* match
     set. Folders contribute nothing; only files. Used by the chip strip
     so chip choices are stable as the user toggles individual chips on/off. */
  extsInMatches: string[];
  /* Whether the search query is currently valid (regex compiles). */
  searchValid: boolean;
  /* True when the tree has been truncated server-side. */
  truncated: boolean;
}

const EMPTY: TreeView = {
  rows: [],
  extsInMatches: [],
  searchValid: true,
  truncated: false,
};

function buildChildrenMap(
  entries: TreeViewEntry[],
): Map<number | null, TreeViewEntry[]> {
  const map = new Map<number | null, TreeViewEntry[]>();
  for (const entry of entries) {
    const arr = map.get(entry.parent) ?? [];
    arr.push(entry);
    map.set(entry.parent, arr);
  }
  return map;
}

function makeMatcher(
  search: FilesSearchState,
): { fn: (name: string) => boolean; valid: boolean } {
  const q = search.q.trim();
  if (q.length === 0) return { fn: () => true, valid: true };
  if (search.regex) {
    try {
      const re = new RegExp(q, search.caseSensitive ? "" : "i");
      return { fn: (name) => re.test(name), valid: true };
    } catch {
      return { fn: () => false, valid: false };
    }
  }
  const needle = search.caseSensitive ? q : q.toLowerCase();
  if (search.whole) {
    const wordRe = new RegExp(
      `(?:^|[^A-Za-z0-9_])${escapeRegExp(needle)}(?:$|[^A-Za-z0-9_])`,
      search.caseSensitive ? "" : "i",
    );
    return { fn: (name) => wordRe.test(name), valid: true };
  }
  return {
    fn: (name) =>
      (search.caseSensitive ? name : name.toLowerCase()).includes(needle),
    valid: true,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function absPathForTreeEntry(root: string, relPath: string): string {
  const trimmedRoot = root.replace(/\/+$/, "");
  if (relPath.length === 0) return trimmedRoot.length > 0 ? trimmedRoot : "/";
  if (trimmedRoot.length === 0) return `/${relPath}`;
  return `${trimmedRoot}/${relPath}`;
}

function entriesWithAbsPaths(tree: FilesTreeResponse): TreeViewEntry[] {
  return tree.entries.map((entry) => ({
    ...entry,
    absPath: absPathForTreeEntry(tree.root, entry.relPath),
  }));
}

export function buildTreeView(
  tree: FilesTreeResponse | null,
  expanded: Record<string, true>,
  search: FilesSearchState,
  sessionFavs: Set<string>,
  projectFavs: Set<string>,
): TreeView {
  if (tree === null) return EMPTY;

  const entries = entriesWithAbsPaths(tree);
  const childrenByParent = buildChildrenMap(entries);
  const matcher = makeMatcher(search);
  const chipFilter = new Set(search.exts);
  const hasChips = chipFilter.size > 0;
  const hasQuery = search.q.trim().length > 0;

  /* Pre-compute which entries match (file/dir name only, not full relPath
     — easier to type-match and matches typical IDE search semantics). */
  const directMatch = new Set<number>();
  for (const entry of entries) {
    if (!matcher.fn(entry.name)) continue;
    if (entry.isDir) {
      directMatch.add(entry.index);
      continue;
    }
    if (hasChips && (entry.ext === null || !chipFilter.has(entry.ext))) {
      continue;
    }
    directMatch.add(entry.index);
  }

  /* Propagate matches up so ancestor folders containing matching descendants
     remain visible (the user wants to see "folders that contain somewhere
     within them files that contain the name"). */
  const keep = new Set<number>(directMatch);
  for (const idx of directMatch) {
    let cur: number | null = entries[idx]!.parent;
    while (cur !== null && !keep.has(cur)) {
      keep.add(cur);
      cur = entries[cur]!.parent;
    }
  }

  function sortChildren(items: TreeViewEntry[]): TreeViewEntry[] {
    return [...items].sort((a, b) => {
      const aSess = sessionFavs.has(a.absPath);
      const bSess = sessionFavs.has(b.absPath);
      if (aSess !== bSess) return aSess ? -1 : 1;
      const aProj = projectFavs.has(a.absPath);
      const bProj = projectFavs.has(b.absPath);
      if (aProj !== bProj) return aProj ? -1 : 1;
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  const filterActive = hasQuery || hasChips;

  function walk(parent: number | null): VisibleRow[] {
    const children = childrenByParent.get(parent);
    if (children === undefined) return [];
    const filtered = filterActive
      ? children.filter((c) => keep.has(c.index))
      : children;
    const sorted = sortChildren(filtered);
    const out: VisibleRow[] = [];
    for (const entry of sorted) {
      const childList = childrenByParent.get(entry.index);
      const hasChildren = childList !== undefined && childList.length > 0;
      const isOpen =
        entry.isDir && (filterActive || expanded[entry.relPath] === true);
      const childRows: VisibleRow[] =
        entry.isDir && isOpen ? walk(entry.index) : [];
      out.push({
        entry,
        isOpen,
        hasChildren,
        fav: sessionFavs.has(entry.absPath)
          ? NO_LOOSE_STRING_VALUES.session
          : projectFavs.has(entry.absPath)
            ? NO_LOOSE_STRING_VALUES.project
            : null,
        children: childRows,
      });
    }
    return out;
  }
  const rows = walk(null);

  /* Compute the extension set from direct file matches (ignoring current
     chip filter so the chip strip reflects what *could* be filtered). */
  const extsSet = new Set<string>();
  for (const idx of directMatch) {
    const entry = entries[idx]!;
    if (!entry.isDir && entry.ext !== null) extsSet.add(entry.ext);
  }
  /* When chips ARE active we widened the directMatch to skip non-chip files,
     so re-derive ext set ignoring the chip filter to keep all options stable. */
  if (hasChips) {
    extsSet.clear();
    for (const entry of entries) {
      if (entry.isDir) continue;
      if (!matcher.fn(entry.name)) continue;
      if (entry.ext !== null) extsSet.add(entry.ext);
    }
  }

  return {
    rows,
    extsInMatches: [...extsSet].sort(),
    searchValid: matcher.valid,
    truncated: tree.truncated,
  };
}

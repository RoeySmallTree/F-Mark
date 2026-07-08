import type { GitFileStatus, LineContext } from "@f-mark/shared";
import { loadMap, saveJson } from "./storagePersistence.js";

/** A "reveal this line in the open file viewer" request. The file viewer
 *  resolves a file-comment's root-relative `file_path` to an absolute viewer
 *  path, opens the tab, then pushes one of these so the active renderer scrolls
 *  the line into view and flashes it. */
export interface PendingFileReveal {
  absPath: string;
  line: number;
  nonce: number;
  lineContext?: LineContext;
  lines?: [number, number];
}

export interface OpenFileTab {
  path: string;
  pinned: boolean;
}

/* Per-tab diff state. Mode controls whether/how the diff is computed; style is
   inline vs side-by-side. Default mode is current-session. Resets on reload. */
export type FileViewerDiffMode = "none" | "current-session" | "whole-branch";
export type FileViewerDiffStyle = "inline" | "side-by-side";
export interface FileViewerDiffState {
  mode: FileViewerDiffMode;
  style: FileViewerDiffStyle;
  baseRef: string | null;
}
export const DEFAULT_FILE_VIEWER_DIFF: FileViewerDiffState = {
  mode: "current-session",
  style: "side-by-side",
  baseRef: null,
};

/* Renderer-side cache of the per-project git/diff settings. */
export interface GitDiffSettingsCacheEntry {
  baseRefOverride: string | null;
  detectedBaseRef: string | null;
  effectiveBaseRef: string | null;
  mergeBaseSha: string | null;
  status: "ok" | "not-git" | "base-not-found";
}

export type GitChangedByPathId = Record<string, Record<string, GitFileStatus>>;
export type GitRenamesByPathId = Record<string, Record<string, string>>;

/* File-viewer persistence - per-session open tabs + active tab. Placement is
   the dock's concern now; stale values for old layout keys are ignored. */
const FILE_VIEWER_TABS_STORAGE_KEY = "fmark.fileViewer.tabsBySession";
const FILE_VIEWER_ACTIVE_STORAGE_KEY =
  "fmark.fileViewer.activeBySession";

function normalizeOpenFileTabs(value: unknown): OpenFileTab[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tabs: OpenFileTab[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (item === null || typeof item !== "object") continue;
    const path = (item as { path?: unknown }).path;
    const pinned = (item as { pinned?: unknown }).pinned;
    if (typeof path !== "string" || path.length === 0) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    tabs.push({ path, pinned: pinned === true });
  }
  return tabs;
}

export function loadFileViewerTabsBySession(): Record<string, OpenFileTab[]> {
  return loadMap(FILE_VIEWER_TABS_STORAGE_KEY, normalizeOpenFileTabs);
}

export function saveFileViewerTabsBySession(
  map: Record<string, OpenFileTab[]>,
): void {
  saveJson(FILE_VIEWER_TABS_STORAGE_KEY, map);
}

export function loadFileViewerActiveBySession(): Record<string, string> {
  return loadMap(FILE_VIEWER_ACTIVE_STORAGE_KEY, (value) =>
    typeof value === "string" && value.length > 0 ? value : undefined,
  );
}

export function saveFileViewerActiveBySession(
  map: Record<string, string>,
): void {
  saveJson(FILE_VIEWER_ACTIVE_STORAGE_KEY, map);
}

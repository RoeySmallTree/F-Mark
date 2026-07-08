import type {
  GitChangedFilesResponse,
  GitDiffSettingsResponse,
} from "@f-mark/shared";

import type { RootScope } from "../../../api/rootScope.js";
import type { GitDiffSettingsCacheEntry } from "../../../state/fileViewerPersistence.js";

const NO_LOOSE_STRING_VALUES = {
  notGit: "not-git",
  ok: "ok",
  err: "err",
} as const;

export interface GitDiffPanelMessage {
  kind: "ok" | "err";
  text: string;
}

export function resolveGitDiffScope(
  activePathId: string | null,
  activePath: string | null,
): RootScope | null {
  if (activePathId !== null) return { pathId: activePathId };
  if (activePath !== null) return { root: activePath };
  return null;
}

export function gitDiffCacheEntry(
  settings: GitDiffSettingsResponse,
): GitDiffSettingsCacheEntry {
  return {
    baseRefOverride: settings.diff_base_ref_override,
    detectedBaseRef: settings.detected_base_ref,
    effectiveBaseRef: settings.effective_base_ref,
    mergeBaseSha: settings.merge_base_sha,
    status: settings.status,
  };
}

export function overrideInputValue(
  settings: GitDiffSettingsResponse,
): string {
  return settings.diff_base_ref_override ?? "";
}

export function isDirtyOverride(
  settings: GitDiffSettingsResponse | null,
  override: string,
): boolean {
  return (settings?.diff_base_ref_override ?? "") !== override.trim();
}

export function hasSavedOverride(
  settings: GitDiffSettingsResponse | null,
): boolean {
  return (settings?.diff_base_ref_override ?? null) !== null;
}

export function isNotGitStatus(
  settings: GitDiffSettingsResponse | null,
): boolean {
  return settings?.status === NO_LOOSE_STRING_VALUES.notGit;
}

export function shortGitSha(sha: string | null | undefined): string {
  return sha?.slice(0, 12) ?? "—";
}

export function validationMessage(
  response: GitChangedFilesResponse,
): GitDiffPanelMessage {
  if (response.status === NO_LOOSE_STRING_VALUES.ok) {
    return {
      kind: NO_LOOSE_STRING_VALUES.ok,
      text: `Valid — merge-base ${shortGitSha(response.merge_base_sha)}.`,
    };
  }
  return { kind: NO_LOOSE_STRING_VALUES.err, text: `Invalid base ref (${response.status}).` };
}

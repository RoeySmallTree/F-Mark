import type { GitDiffMode, GitHunk, GitRevertAction } from "@f-mark/shared";
import { GitRevertError, type Client, type RootScope } from "../../../../api/client.js";

const NO_LOOSE_STRING_VALUES = {
  hunkConflict: "HUNK_CONFLICT",
} as const;

export interface RevertHunkChangeArgs {
  action: GitRevertAction;
  baseRef: string | null;
  client: Client;
  hunk?: GitHunk;
  oldPath?: string;
  relPath: string;
  scope: RootScope;
  sessionId: string | null;
  wireMode: GitDiffMode;
}

export async function revertHunkChange({
  action,
  baseRef,
  client,
  hunk,
  oldPath,
  relPath,
  scope,
  sessionId,
  wireMode,
}: RevertHunkChangeArgs): Promise<string | null> {
  try {
    await client.gitRevertHunk(scope, {
      relPath,
      mode: wireMode,
      action,
      ...(baseRef !== null ? { base: baseRef } : {}),
      ...(hunk !== undefined ? { hunkId: hunk.id } : {}),
      ...(oldPath !== undefined ? { oldPath } : {}),
      ...(sessionId !== null ? { sessionId } : {}),
    });
    return null;
  } catch (err) {
    return revertErrorMessage(err);
  }
}

function revertErrorMessage(err: unknown): string {
  if (err instanceof GitRevertError && err.code === NO_LOOSE_STRING_VALUES.hunkConflict) {
    return "This hunk changed on disk — refresh the diff and try again.";
  }
  if (err instanceof GitRevertError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

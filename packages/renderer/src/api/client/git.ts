import type {
  GitChangedFilesResponse,
  GitBranchRefsResponse,
  GitDiffResponse,
  GitDiffSettingsResponse,
  GitFileVersionResponse,
  GitRevertHunkResponse,
} from "@f-mark/shared";

import type { Client } from "../client.js";
import { appendScopeQuery, scopeToBody } from "../rootScope.js";
import {
  GitRevertError,
  type ApiHttpClient,
} from "./core.js";

type GitMethods = Pick<
  Client,
  | "gitChangedFiles"
  | "gitBranchRefs"
  | "gitDiff"
  | "gitFileVersion"
  | "gitBlobVersionUrl"
  | "gitDiffSettings"
  | "putGitDiffSettings"
  | "gitRevertHunk"
>;

export function createGitMethods(http: ApiHttpClient): GitMethods {
  return {
    async gitChangedFiles(input) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, input.scope);
      qs.set("mode", input.mode);
      if (input.sessionId !== undefined) qs.set("session_id", input.sessionId);
      if (input.base !== undefined) qs.set("base", input.base);
      return http.get<GitChangedFilesResponse>(
        `/git/changed-files?${qs.toString()}`,
      );
    },
    async gitBranchRefs(scope) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, scope);
      return http.get<GitBranchRefsResponse>(`/git/branches?${qs.toString()}`);
    },
    async gitDiff(input) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, input.scope);
      qs.set("rel_path", input.relPath);
      qs.set("mode", input.mode);
      if (input.sessionId !== undefined) qs.set("session_id", input.sessionId);
      if (input.base !== undefined) qs.set("base", input.base);
      return http.get<GitDiffResponse>(`/git/diff?${qs.toString()}`);
    },
    async gitFileVersion(input) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, input.scope);
      qs.set("rel_path", input.relPath);
      qs.set("mode", input.mode);
      if (input.sessionId !== undefined) qs.set("session_id", input.sessionId);
      if (input.base !== undefined) qs.set("base", input.base);
      return http.get<GitFileVersionResponse>(
        `/git/file-version?${qs.toString()}`,
      );
    },
    gitBlobVersionUrl(input) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, input.scope);
      qs.set("rel_path", input.relPath);
      qs.set("version", input.version);
      qs.set("mode", input.mode);
      if (input.base !== undefined) qs.set("base", input.base);
      if (http.token !== null && http.token.length > 0) {
        qs.set("token", http.token);
      }
      return `${http.baseUrl}/git/blob-version?${qs.toString()}`;
    },
    async gitDiffSettings(scope) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, scope);
      return http.get<GitDiffSettingsResponse>(
        `/git/diff-settings?${qs.toString()}`,
      );
    },
    async putGitDiffSettings(input) {
      return http.put<GitDiffSettingsResponse>("/git/diff-settings", {
        path_id: input.pathId,
        diff_base_ref_override: input.diffBaseRefOverride,
      });
    },
    async gitRevertHunk(scope, input) {
      const res = await http.fetchRaw("/git/revert-hunk", {
        method: "POST",
        headers: http.jsonHeaders(),
        body: JSON.stringify({
          ...scopeToBody(scope),
          rel_path: input.relPath,
          mode: input.mode,
          ...(input.hunkId !== undefined ? { hunk_id: input.hunkId } : {}),
          ...(input.action !== undefined ? { action: input.action } : {}),
          ...(input.oldPath !== undefined ? { old_path: input.oldPath } : {}),
          ...(input.base !== undefined ? { base: input.base } : {}),
          ...(input.sessionId !== undefined ? { session_id: input.sessionId } : {}),
        }),
      });
      if (res.ok) return (await res.json()) as GitRevertHunkResponse;
      /* Surface the server `code` so the diff UI can branch on HUNK_CONFLICT. */
      let errBody: { code?: string; message?: string } = {};
      try {
        errBody = (await res.json()) as { code?: string; message?: string };
      } catch {
        /* non-JSON error */
      }
      throw new GitRevertError(
        errBody.code ?? `HTTP_${res.status}`,
        res.status,
        errBody.message ?? `HTTP ${res.status}`,
      );
    },
  };
}

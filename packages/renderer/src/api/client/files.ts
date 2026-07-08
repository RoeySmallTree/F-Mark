import type {
  Client,
  FileTextResponse,
  FilesFavoritesResponse,
  FilesTreeResponse,
} from "../client.js";
import {
  appendScopeQuery,
  scopeToBody,
} from "../rootScope.js";
import type { ApiHttpClient } from "./core.js";

type FileMethods = Pick<
  Client,
  | "fetchFilesTree"
  | "fetchFilesFavorites"
  | "addFilesFavorite"
  | "removeFilesFavorite"
  | "fileContentUrl"
  | "fetchFileText"
  | "saveFileText"
>;

export function createFileMethods(http: ApiHttpClient): FileMethods {
  return {
    async fetchFilesTree(scope) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, scope);
      return http.get<FilesTreeResponse>(`/files/tree?${qs.toString()}`);
    },
    async fetchFilesFavorites(scope, sessionId, root) {
      const qs = new URLSearchParams({ scope });
      if (sessionId !== undefined && sessionId.length > 0) {
        qs.set("sessionId", sessionId);
      }
      if (root !== undefined) appendScopeQuery(qs, root);
      return http.get<FilesFavoritesResponse>(
        `/files/favorites?${qs.toString()}`,
      );
    },
    async addFilesFavorite(input) {
      const { root, ...rest } = input;
      return http.post<FilesFavoritesResponse>("/files/favorites", {
        ...rest,
        ...(root !== undefined ? scopeToBody(root) : {}),
      });
    },
    async removeFilesFavorite(input) {
      const qs = new URLSearchParams({ scope: input.scope, path: input.path });
      if (input.sessionId !== undefined && input.sessionId.length > 0) {
        qs.set("sessionId", input.sessionId);
      }
      if (input.root !== undefined) appendScopeQuery(qs, input.root);
      return http.del<FilesFavoritesResponse>(
        `/files/favorites?${qs.toString()}`,
      );
    },
    fileContentUrl(scope, relPath) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, scope);
      qs.set("rel_path", relPath);
      if (http.token !== null && http.token.length > 0) {
        qs.set("token", http.token);
      }
      return `${http.baseUrl}/files/content?${qs.toString()}`;
    },
    async fetchFileText(scope, relPath, maxBytes) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, scope);
      qs.set("rel_path", relPath);
      if (maxBytes !== undefined) qs.set("maxBytes", String(maxBytes));
      return http.get<FileTextResponse>(`/files/text?${qs.toString()}`);
    },
    async saveFileText(scope, relPath, content) {
      return http.put<FileTextResponse>("/files/text", {
        ...scopeToBody(scope),
        rel_path: relPath,
        content,
      });
    },
  };
}

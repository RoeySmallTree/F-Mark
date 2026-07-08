import type {
  Client,
  FsListResponse,
  PathFavorite,
  PathsResponse,
} from "../client.js";
import type { ApiHttpClient } from "./core.js";

type PathMethods = Pick<
  Client,
  | "fsList"
  | "fsHome"
  | "getPaths"
  | "setActivePath"
  | "registerKnownPath"
  | "clearActivePath"
  | "removeKnownPath"
  | "addFavorite"
  | "removeFavorite"
  | "renameFavorite"
>;

export function createPathMethods(http: ApiHttpClient): PathMethods {
  return {
    async fsList(path) {
      return http.get<FsListResponse>(`/fs/list?path=${encodeURIComponent(path)}`);
    },
    async fsHome() {
      return http.get<{ home: string; xdgConfigHome: string | null }>("/fs/home");
    },
    async getPaths() {
      return http.get<PathsResponse>("/paths");
    },
    async setActivePath(path) {
      return http.post<PathsResponse>("/paths/active", { path });
    },
    async registerKnownPath(path) {
      return http.post<PathsResponse>("/paths/known", { path });
    },
    async clearActivePath() {
      return http.del<PathsResponse>("/paths/active");
    },
    async removeKnownPath(path) {
      return http.del<{ knownPaths: string[] }>(
        `/paths/known?path=${encodeURIComponent(path)}`,
      );
    },
    async addFavorite(input) {
      return http.post<{ favorites: PathFavorite[] }>("/paths/favorites", input);
    },
    async removeFavorite(path) {
      return http.del<{ favorites: PathFavorite[] }>(
        `/paths/favorites?path=${encodeURIComponent(path)}`,
      );
    },
    async renameFavorite(input) {
      return http.patch<{ favorites: PathFavorite[] }>("/paths/favorites", input);
    },
  };
}

import type { Paths } from "../../paths.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import type { TmuxManager } from "../../tmux/manager.js";
import type { ForkSessionRequest, UpdateSessionRequest } from "@f-mark/shared";

export interface SessionRouteDeps {
  /** Fallback paths used when the multi-path ref is absent or has no active
      path. Retained so existing tests that wire only `paths` keep working. */
  fallback: Paths;
  /** Optional multi-path ref. When provided, GET /sessions uses ref.active
      (or `fallback` if active is null), and POST /sessions can accept a
      `path` body field to create + activate. */
  ref?: PathContextRef;
  /** Optional tmux manager getter. POST /sessions with a `path` activates
      that path; when process spawning is enabled, new managed spawns must
      bind to the same freshly-active root. */
  getTmuxManager?: () => TmuxManager | null;
  token?: string | null;
}

export type SessionScopeInput = {
  path?: unknown;
  path_id?: unknown;
  root?: unknown;
};

export type ScopedSessionPathsResult =
  | { ok: true; paths: Paths }
  | { ok: false; status: number; body: unknown };

export interface RouteResult<T> {
  status?: number;
  body: T;
}

export type UpdateSessionRouteBody = UpdateSessionRequest & {
  path_id?: string;
  root?: string;
};

export type ForkSessionRouteBody = ForkSessionRequest & {
  path_id?: string;
  root?: string;
};

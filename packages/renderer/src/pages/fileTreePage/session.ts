import type { SessionMeta } from "@f-mark/shared";

export interface LaunchParams {
  sessionId: string | null;
  pathId: string | null;
  token: string | null;
}

export function parseLaunch(): LaunchParams {
  if (typeof window === "undefined") {
    return { sessionId: null, pathId: null, token: null };
  }
  /* /file-tree/:sessionId?path_id=&token= */
  const segments = window.location.pathname.split("/").filter(Boolean);
  // segments[0] === "file-tree"; segments[1] === sessionId
  const sessionId =
    segments.length > 1 ? decodeURIComponent(segments[1]!) : null;
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId,
    pathId: params.get("path_id"),
    token: params.get("token"),
  };
}

export function basename(absPath: string): string {
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash < 0 ? trimmed : trimmed.slice(slash + 1) || trimmed;
}

/* Resolve (path_id, sessionId) against the all-session list. Session ids can
   collide across roots, so path_id is the disambiguator (spec section 6.1).
   path_id is only a 12-char hash prefix, so even a supplied path_id can match
   more than one root; in that case we reject as ambiguous rather than silently
   picking the first. When path_id is absent and the id is ambiguous, also
   reject. */
export function resolveSession(
  all: SessionMeta[],
  sessionId: string,
  pathId: string | null,
): { ok: true; session: SessionMeta } | { ok: false; reason: string } {
  const matches = all.filter((s) => s.id === sessionId);
  if (matches.length === 0) {
    return { ok: false, reason: `session not found: ${sessionId}` };
  }
  if (pathId !== null) {
    const exact = matches.filter((s) => s.path_id === pathId);
    if (exact.length === 0) {
      return {
        ok: false,
        reason: `session ${sessionId} not found under path ${pathId}`,
      };
    }
    if (exact.length > 1) {
      return {
        ok: false,
        reason: `ambiguous path ${pathId} for session ${sessionId} (matches ${exact.length} roots — disambiguation required)`,
      };
    }
    return { ok: true, session: exact[0]! };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: `ambiguous session ${sessionId} (provide path_id)`,
    };
  }
  return { ok: true, session: matches[0]! };
}

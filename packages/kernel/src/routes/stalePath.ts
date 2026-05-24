import { realpathSync } from "node:fs";
import { computePathId } from "../paths/identity.js";
import type { PathDeps } from "./pathDeps.js";

/* Common helper for event POSTs that may carry a `path` body field
   (hooks include it; UI calls don't). When present, the kernel compares
   the canonical pathId to the active path's. If they mismatch, the
   request targets a backgrounded path and we return 409 STALE_PATH so
   the hook knows its post landed in the wrong place.

   When `quietCrossPathHooks` is true, the mismatch is logged but
   accepted (the kernel writes the event to the targeted path anyway).
   This is the v0.5 escape hatch for users who actively want hooks from
   idle paths to flow through. */

export interface StalePathOk {
  ok: true;
  /** Original path string from the body, canonicalized; undefined if no body.path. */
  canonicalPath?: string;
}
export interface StalePathError {
  ok: false;
  status: number;
  body: { code: string; message: string; details?: Record<string, unknown> };
}

export function checkPathAgainstActive(
  bodyPath: unknown,
  deps: PathDeps,
  opts: { quietCrossPathHooks?: boolean } = {},
): StalePathOk | StalePathError {
  if (typeof bodyPath !== "string" || bodyPath.length === 0) {
    return { ok: true };
  }
  if (!deps.ref) {
    // No multi-path context wired (legacy / tests). Accept the body.path
    // silently — there's nothing to compare against.
    return { ok: true };
  }
  let canonical: string;
  try {
    canonical = realpathSync(bodyPath);
  } catch {
    // body.path doesn't exist on disk — treat as ok (don't reject for an
    // unrelated FS issue). Hooks should not block on this.
    return { ok: true };
  }
  const incomingId = computePathId(canonical);
  const activeId = deps.ref.pathId();
  if (activeId === null || activeId === incomingId) {
    return { ok: true, canonicalPath: canonical };
  }
  if (opts.quietCrossPathHooks) {
    // Accept but don't 409. Kernel still writes the event; consumers can
    // tell from the path envelope on the broadcast that the event came
    // from a different path. Useful for users running long-lived agents
    // in backgrounded paths.
    return { ok: true, canonicalPath: canonical };
  }
  return {
    ok: false,
    status: 409,
    body: {
      code: "STALE_PATH",
      message: `hook path ${canonical} does not match active path`,
      details: {
        active_path_id: activeId,
        body_path_id: incomingId,
      },
    },
  };
}

import type { GlobalPaths } from "./global.js";
import type { ActivePaths } from "./active.js";

export interface PathContext {
  global: GlobalPaths;
  active: ActivePaths | null;
}

/* Sentinel error for routes that require an active path. The HTTP layer
   catches this and returns a 409 NO_ACTIVE_PATH structured error so the
   renderer can show the "pick a folder" empty state. */
export class NoActivePathError extends Error {
  readonly code = "NO_ACTIVE_PATH";
  constructor() {
    super("no active path");
  }
}

export function requireActive(ctx: PathContext): ActivePaths {
  if (ctx.active === null) throw new NoActivePathError();
  return ctx.active;
}

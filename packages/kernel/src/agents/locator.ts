import { join } from "node:path";
import type { GlobalPaths } from "../paths/global.js";
import type { PathContextRef } from "../paths/contextRef.js";
import type { Paths } from "../paths.js";

/* Single decision point for where managed-agent state lives.

   v0.4 (and existing tests) keep agent state under `<root>/.f-mark/agents`.
   v0.5 (multi-path) partitions agents under
   `~/.config/f-mark/projects/<pathId>/agents` so a single user running
   multiple paths doesn't collide on participant ids.

   The resolver picks the global location when a PathContextRef with an
   active path is present; otherwise falls back to the per-path
   `<fmarkDir>/agents`. */

export function agentsDirFor(opts: {
  ref?: PathContextRef;
  fallback: Paths;
}): string {
  if (opts.ref) {
    const active = opts.ref.get().active;
    if (active !== null) {
      return opts.ref.global().projectAgentsDir(active.pathId());
    }
  }
  return join(opts.fallback.fmarkDir(), "agents");
}

/* Hook-side helper: hooks know the project root (from F_MARK_PATH or upward
   walk) and the global paths. They don't have a PathContextRef. This
   computes the agents dir directly. */
export function agentsDirForPathId(
  global: GlobalPaths,
  pathId: string,
): string {
  return global.projectAgentsDir(pathId);
}

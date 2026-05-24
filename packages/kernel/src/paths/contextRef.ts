import type { ActivePaths } from "./active.js";
import type { GlobalPaths } from "./global.js";
import type { PathContext } from "./context.js";

/* Mutable container for the live PathContext. Routes capture the ref at
   registration time; they call `.get()` per-request so a path switch
   applied via /paths/active is reflected immediately by subsequent
   requests without re-registering routes.

   `revision` mirrors state.json's activeRevision and is bumped explicitly
   by callers after an updateState() that bumped the value. The WS
   envelope wrap (registerWebSocket → wrapBusWithEnvelope) reads it on
   every publish so messages from path A delivered after a switch to B
   carry the stale revision and get filtered out by the renderer. */
export class PathContextRef {
  private ctx: PathContext;
  private rev = 0;

  constructor(initial: PathContext, initialRevision = 0) {
    this.ctx = initial;
    this.rev = initialRevision;
  }

  get(): PathContext {
    return this.ctx;
  }

  setActive(active: ActivePaths | null): void {
    this.ctx = { global: this.ctx.global, active };
  }

  global(): GlobalPaths {
    return this.ctx.global;
  }

  /** Current pathId (null when no active path). Used by the WS envelope wrap. */
  pathId(): string | null {
    return this.ctx.active?.pathId() ?? null;
  }

  /** Monotonic revision mirrored from state.json. */
  revision(): number {
    return this.rev;
  }

  /** Update the cached revision. Call after updateState() has bumped state.json. */
  setRevision(next: number): void {
    this.rev = next;
  }
}

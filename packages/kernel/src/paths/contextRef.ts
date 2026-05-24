import type { ActivePaths } from "./active.js";
import type { GlobalPaths } from "./global.js";
import type { PathContext } from "./context.js";

/* Mutable container for the live PathContext. Routes capture the ref at
   registration time; they call `.get()` per-request so a path switch
   applied via /paths/active is reflected immediately by subsequent
   requests without re-registering routes. */
export class PathContextRef {
  private ctx: PathContext;

  constructor(initial: PathContext) {
    this.ctx = initial;
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
}

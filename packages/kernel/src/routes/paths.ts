import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import type { KernelState } from "../state/store.js";
import type { Bus } from "../ws/bus.js";
import type { TmuxManager } from "../tmux/manager.js";
import { registerPathReadRoute } from "./paths/readRoute.js";
import { PathRouteContext } from "./paths/routeContext.js";
import { registerActivePathRoutes } from "./paths/activeRoutes.js";
import { registerKnownPathRoutes } from "./paths/knownRoutes.js";
import { registerFavoritePathRoutes } from "./paths/favoriteRoutes.js";

export function registerPathRoutes(
  app: FastifyInstance,
  ref: PathContextRef,
  busGetter?: () => Bus,
  /* Optional tmux manager. When provided, /paths/active and DELETE
     /paths/active call manager.rebind so subsequent spawns + listFmark
     scope to the new path. Pre-existing tmux sessions retain their old
     tag and stay visible only from the path they were spawned in. */
  tmuxGetter?: () => TmuxManager | null,
  token?: string | null,
  /* The boot/fallback paths — its config.json carries the kernel's actually
     bound port (index.ts syncs it post-listen). Used to stamp a newly
     initialized switched-to project with the right port instead of the
     default, so hooks/MCP for agents in that path reach this kernel. */
  fallbackPaths?: Paths,
): void {
  const context = new PathRouteContext({
    ref,
    busGetter,
    tmuxGetter,
    token,
    fallbackPaths,
  });
  registerPathReadRoute(app, context);
  registerActivePathRoutes(app, context);
  registerKnownPathRoutes(app, context);
  registerFavoritePathRoutes(app, context);
}

/* Expose for tests that want to seed/read state directly without going
   through the HTTP layer. */
export type { KernelState };

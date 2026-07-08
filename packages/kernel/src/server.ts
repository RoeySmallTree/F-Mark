import { createKernelApp } from "./server/app.js";
import { ServerRuntime } from "./server/runtime.js";
import {
  registerCoreRoutes,
  registerProcessApiRoutes,
  registerStaticAssets,
} from "./server/routes.js";
import type { CreatedServer, ServerDeps } from "./server/types.js";

export type { CreatedServer, ServerDeps } from "./server/types.js";

export function createServer(deps: ServerDeps): CreatedServer {
  const { app, initialProjectRoot, processApiEnabled } = createKernelApp(deps);
  const runtime = new ServerRuntime(app, deps);
  const { pathDeps, mcpHttpController } = registerCoreRoutes(
    app,
    deps,
    runtime,
  );
  registerProcessApiRoutes(app, deps, runtime, pathDeps, {
    initialProjectRoot,
    mcpHttpController,
    processApiEnabled,
  });
  registerStaticAssets(app);

  return {
    app,
    getBus: () => runtime.getBus(),
    getTracker: () => runtime.getTracker(),
  };
}

import { ensureProjectAuth } from "../../auth.js";
import { type Paths } from "../../paths.js";
import { initProject, readConfig } from "../../project.js";
import type { SessionRouteDeps } from "./types.js";

export async function initSessionProject(
  deps: SessionRouteDeps,
  p: Paths,
): Promise<void> {
  const port = await fallbackPort(deps);

  if (port === undefined) {
    await initProject(p);
  } else {
    await initProject(p, port);
  }

  await ensureProjectAuth(p, deps.token ?? null);
}

async function fallbackPort(
  deps: SessionRouteDeps,
): Promise<number | undefined> {
  try {
    return (await readConfig(deps.fallback)).port;
  } catch {
    return undefined;
  }
}

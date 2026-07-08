import type { PathDeps } from "../routes/pathDeps.js";
import { resolvePaths } from "../routes/pathDeps.js";
import {
  initRuntimesFile,
  loadOfferableRuntimes,
  loadRuntimes,
  type RuntimesFile,
} from "./registry.js";

function resolveRuntimesDir(deps: PathDeps): string {
  const active = deps.ref?.get().active ?? null;
  if (deps.ref !== undefined && active !== null) {
    return deps.ref.global().projectDir(active.pathId());
  }
  return resolvePaths(deps).fmarkDir();
}

export async function ensureRuntimesDir(deps: PathDeps): Promise<string> {
  const dir = resolveRuntimesDir(deps);
  await initRuntimesFile(dir);
  return dir;
}

export async function loadRuntimeRegistry(
  deps: PathDeps,
): Promise<RuntimesFile> {
  return loadRuntimes(await ensureRuntimesDir(deps));
}

export async function loadOfferableRuntimeRegistry(
  deps: PathDeps,
): Promise<RuntimesFile> {
  return loadOfferableRuntimes(await ensureRuntimesDir(deps));
}

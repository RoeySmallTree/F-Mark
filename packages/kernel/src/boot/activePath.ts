import type { KernelState } from "../state/store.js";

export function resolveBootActivePath(input: {
  explicitPath?: string;
  launchPath: string;
  state: Pick<KernelState, "activePath">;
}): string {
  if (input.explicitPath !== undefined) return input.explicitPath;
  if (input.state.activePath !== null && input.state.activePath.length > 0) {
    return input.state.activePath;
  }
  return input.launchPath;
}

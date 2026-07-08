import process from "node:process";

export function parsePidList(output: string): number[] {
  const pids = new Set<number>();
  for (const token of output.split(/\s+/)) {
    if (!/^\d+$/.test(token)) continue;
    const pid = Number(token);
    if (Number.isSafeInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

export function formatListenerPids(pids: number[]): string {
  return pids.length > 0 ? pids.join(", ") : "none";
}

export function uniquePids(pids: number[]): number[] {
  return [...new Set(pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
}

export function signalablePids(pids: number[]): number[] {
  return uniquePids(pids).filter((pid) => pid !== process.pid);
}

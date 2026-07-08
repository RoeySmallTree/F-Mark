export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, totalSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function elapsedSeconds(options: {
  nowMs: number;
  pausedMs: number;
  turnStartMs: number | null;
}): number | null {
  return options.turnStartMs === null
    ? null
    : Math.max(
        0,
        Math.floor((options.nowMs - options.turnStartMs - options.pausedMs) / 1000),
      );
}


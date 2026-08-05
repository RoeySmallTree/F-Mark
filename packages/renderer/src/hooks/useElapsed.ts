import { useEffect, useState } from "react";

/* A blocked agent's wait time is the one number whose whole job is to say
   "still stuck, and getting worse". Rendered once it silently stops being
   true, which erodes trust in it the moment someone notices. This is the
   approval wait timer's formatter — precise to the second, forever, because
   for that timer the exact number IS the point. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const FRESHNESS_JUST_NOW = "just now";

const FRESHNESS_QUIET_SECONDS = 10;
const FRESHNESS_MINUTE_SECONDS = 60;

/* The top bar's "last event" age sits a few inches from an open approval's
   own wait timer. When the approval IS the newest event - the common case,
   since an approval is usually WHY nothing else has happened - the two would
   otherwise tick in lockstep on formatElapsed above and read as duplicate
   information. This formatter deliberately reads calmer: nothing under
   ~10s is worth naming, seconds matter up to a minute, and past that only
   whole minutes (then hours) do - unlike the approval timer, where the exact
   second always matters. */
export function formatFreshness(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < FRESHNESS_QUIET_SECONDS) return FRESHNESS_JUST_NOW;
  if (total < FRESHNESS_MINUTE_SECONDS) return `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h` : `${m}m`;
}

/* Tick cadence to pair with formatFreshness: once a minute has passed, the
   display no longer shows seconds, so there is nothing to gain from waking
   the component up every second just to re-render the same string. */
export function freshnessTickMs(elapsedMs: number): number {
  return elapsedMs < FRESHNESS_MINUTE_SECONDS * 1000 ? 1000 : 60_000;
}

export interface UseElapsedOptions {
  /** Defaults to formatElapsed (precise, per-second, forever). */
  format?(ms: number): string;
  /* Defaults to a flat 1000ms. Takes the currently-elapsed ms so the cadence
     can adapt as time passes (see freshnessTickMs) - an options argument
     over the same underlying tick, rather than a second hook, so the two
     call sites (approval timer, top-bar freshness) never drift apart on how
     ticking itself works, only on how often and how it's formatted. */
  tickMs?(elapsedMs: number): number;
}

const DEFAULT_TICK_MS = 1000;

export function useElapsed(
  since: string | number,
  options: UseElapsedOptions = {},
): string {
  const format = options.format ?? formatElapsed;
  const tickMs = options.tickMs;
  const start = typeof since === "number" ? since : Date.parse(since);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: number;
    const scheduleNext = (): void => {
      const delay = tickMs ? tickMs(Date.now() - start) : DEFAULT_TICK_MS;
      id = window.setTimeout(() => {
        setNow(Date.now());
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => window.clearTimeout(id);
  }, [start, tickMs]);
  /* Date.parse returns NaN on an unparseable timestamp, and NaN passes
     through Math.max and Math.floor untouched — the readouts would render
     "NaNs" / "NaNm ago" rather than fail loudly. Zero reads as "hasn't
     started", which is the honest answer when we can't tell. */
  const elapsed = now - start;
  return format(Number.isFinite(elapsed) ? elapsed : 0);
}

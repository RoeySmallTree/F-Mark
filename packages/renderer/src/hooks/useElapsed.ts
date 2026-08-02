import { useEffect, useState } from "react";

/* A blocked agent's wait time is the one number whose whole job is to say
   "still stuck, and getting worse". Rendered once it silently stops being
   true, which erodes trust in it the moment someone notices. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function useElapsed(since: string | number): string {
  const start = typeof since === "number" ? since : Date.parse(since);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return formatElapsed(now - start);
}

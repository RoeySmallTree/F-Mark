export function parseEventTimestamp(ts: string): Date | null {
  let iso = ts;
  const m =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d{3})?Z$/.exec(ts);
  if (m !== null) {
    iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}Z`;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

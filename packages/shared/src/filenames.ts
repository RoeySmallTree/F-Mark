import type { EventKind } from "./events.js";

export interface FilenameParts {
  timestamp: string;
  participant_id: string;
  kind: EventKind;
  ext?: string;
}

const FILENAME_REGEX =
  /^(\d{8}T\d{6}Z)_((?:us|ag|sys|grp)-[a-z0-9-]{2,12})\.([a-z-]+)(?:\.([a-z0-9]+))?$/;

const KINDS_WITHOUT_EXT = new Set<EventKind>(["html"]);

export function composeFilename(parts: FilenameParts): string {
  const base = `${parts.timestamp}_${parts.participant_id}.${parts.kind}`;
  return parts.ext === undefined ? base : `${base}.${parts.ext}`;
}

export function parseFilename(name: string): FilenameParts | null {
  const m = FILENAME_REGEX.exec(name);
  if (m === null) return null;
  const [, ts, pid, kind, ext] = m;
  const k = kind as EventKind;
  if (ext === undefined && !KINDS_WITHOUT_EXT.has(k)) return null;
  return {
    timestamp: ts!,
    participant_id: pid!,
    kind: k,
    ext,
  };
}

export function toIsoTimestamp(date: Date): string {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function isoTimestamp(): string {
  return toIsoTimestamp(new Date());
}

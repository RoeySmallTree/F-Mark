import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  normalizeTimestampForSort,
  parseFilename,
  type AnyEventRecord,
  type EventKind,
} from "@f-mark/shared";
import { parseProse } from "./prose.js";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";

export interface ReadOptions {
  since?: string;
  kinds?: EventKind[];
  participant?: string;
}

async function loadPayload(
  filepath: string,
  kind: EventKind,
  ext: string | undefined,
): Promise<unknown> {
  if (kind === "html") {
    const manifestPath = join(filepath, "manifest.json");
    try {
      return JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      return {};
    }
  }
  const raw = await readFile(filepath, "utf8");
  if (kind === "prose") return parseProse(raw);
  if (ext === "json") return JSON.parse(raw);
  return { raw };
}

export async function readEvents(
  p: Paths,
  sessionId: string,
  opts: ReadOptions,
): Promise<AnyEventRecord[]> {
  if (!(await sessionExists(p, sessionId))) {
    throw new Error(`session not found: ${sessionId}`);
  }
  const dir = p.sessionDir(sessionId);
  const entries = await readdir(dir, { withFileTypes: true });
  const records: AnyEventRecord[] = [];
  for (const entry of entries) {
    const parts = parseFilename(entry.name);
    if (parts === null) continue;
    if (
      opts.since !== undefined &&
      normalizeTimestampForSort(parts.timestamp) <=
        normalizeTimestampForSort(opts.since)
    )
      continue;
    if (opts.kinds !== undefined && !opts.kinds.includes(parts.kind)) continue;
    if (
      opts.participant !== undefined &&
      parts.participant_id !== opts.participant
    ) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    const payload = await loadPayload(fullPath, parts.kind, parts.ext);
    records.push({
      filename: entry.name,
      timestamp: parts.timestamp,
      participant_id: parts.participant_id,
      kind: parts.kind,
      payload,
    });
  }
  records.sort((a, b) => {
    const t = normalizeTimestampForSort(a.timestamp).localeCompare(
      normalizeTimestampForSort(b.timestamp),
    );
    return t !== 0 ? t : a.filename.localeCompare(b.filename);
  });
  return records;
}

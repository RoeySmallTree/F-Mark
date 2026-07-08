import { parseFilename, type AnyEventRecord } from "@f-mark/shared";

interface LinkPayload {
  append_to?: unknown;
  supersedes?: unknown;
}

function linkPayload(event: AnyEventRecord): LinkPayload {
  return event.payload as LinkPayload;
}

function supersededFilenames(event: AnyEventRecord): string[] {
  const supersedes = linkPayload(event).supersedes;
  if (typeof supersedes === "string") {
    return supersedes.length > 0 ? [supersedes] : [];
  }
  if (Array.isArray(supersedes)) {
    return supersedes.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }
  return [];
}

export function eventsMergeIntegrityOk(
  merged: AnyEventRecord[],
  delta: AnyEventRecord[],
): boolean {
  const filenames = new Set(merged.map((event) => event.filename));
  for (const event of delta) {
    for (const supersedes of supersededFilenames(event)) {
      if (!filenames.has(supersedes)) return false;
    }

    const appendTo = linkPayload(event).append_to;
    if (
      typeof appendTo === "string" &&
      parseFilename(appendTo) !== null &&
      !filenames.has(appendTo)
    ) {
      return false;
    }
  }
  return true;
}

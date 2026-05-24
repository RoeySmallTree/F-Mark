import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { EventKind } from "@f-mark/shared";
import { composeFilename, isoTimestamp, toIsoTimestamp } from "@f-mark/shared";
import { listParticipants } from "../participants.js";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";

export interface WriteEventInput {
  participant_id: string;
  kind: EventKind;
  ext: string;
  contents: string;
}

function assertWithinSession(p: Paths, sessionId: string, target: string): void {
  const sessionRoot = resolve(p.sessionDir(sessionId));
  const targetResolved = resolve(target);
  if (
    !targetResolved.startsWith(`${sessionRoot}/`) &&
    targetResolved !== sessionRoot
  ) {
    throw new Error("path escapes session root");
  }
}

function parseCompactTs(ts: string): Date {
  const ms = ts.length === 20 ? ts.slice(16, 19) : "000";
  return new Date(
    `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}.${ms}Z`,
  );
}

function bumpMillisecond(ts: string): string {
  const d = parseCompactTs(ts);
  d.setUTCMilliseconds(d.getUTCMilliseconds() + 1);
  return toIsoTimestamp(d);
}

export async function writeEventFile(
  p: Paths,
  sessionId: string,
  input: WriteEventInput,
): Promise<string> {
  if (!(await sessionExists(p, sessionId))) {
    throw new Error(`session not found: ${sessionId}`);
  }
  const participants = await listParticipants(p);
  if (!(input.participant_id in participants)) {
    throw new Error(`unknown participant: ${input.participant_id}`);
  }

  await mkdir(p.sessionDir(sessionId), { recursive: true });

  let stamped = isoTimestamp();
  for (let attempt = 0; attempt < 256; attempt++) {
    const filename = composeFilename({
      timestamp: stamped,
      participant_id: input.participant_id,
      kind: input.kind,
      ext: input.ext,
    });
    const target = join(p.sessionDir(sessionId), filename);
    assertWithinSession(p, sessionId, target);
    try {
      await writeFile(target, input.contents, { flag: "wx" });
      return filename;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        stamped = bumpMillisecond(stamped);
        continue;
      }
      throw err;
    }
  }
  throw new Error("could not allocate unique event filename");
}

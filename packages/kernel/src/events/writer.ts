import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EventKind } from "@f-mark/shared";
import { composeFilename, isoTimestamp } from "@f-mark/shared";
import { listParticipants } from "../participants.js";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { assertWithinSession, bumpMillisecond } from "./sessionPath.js";

export interface WriteEventInput {
  participant_id: string;
  kind: EventKind;
  ext: string;
  contents: string;
  /** When set, the writer starts the collision-bump loop at this timestamp
   *  instead of calling isoTimestamp(). Used for synchronized cross-session
   *  writes (fork-link pair). On EEXIST inside the session, the loop bumps
   *  by +1ms exactly as it would for the auto-stamped path. */
  timestamp?: string;
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

  let stamped = input.timestamp ?? isoTimestamp();
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

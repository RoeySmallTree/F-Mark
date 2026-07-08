import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig, writeConfig, type Participant } from "../project.js";
import type { Paths } from "../paths.js";

const USER_COLOR = "#3b82f6";

interface ParticipantsFile {
  participants: Record<string, Participant>;
}

export function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function participantsFile(p: Paths): string {
  return join(p.fmarkDir(), "participants.json");
}

function freshUserId(): string {
  return `us-${randomBytes(2).toString("hex")}`;
}

export function defaultParticipants(): Record<string, Participant> {
  return {
    [freshUserId()]: { kind: "user", name: "You", color: USER_COLOR },
  };
}

async function readParticipantsFile(
  p: Paths,
): Promise<Record<string, Participant>> {
  const parsed = JSON.parse(
    await readFile(participantsFile(p), "utf8"),
  ) as Partial<ParticipantsFile>;
  if (
    parsed.participants === undefined ||
    parsed.participants === null ||
    typeof parsed.participants !== "object"
  ) {
    throw new Error("participants.json is missing a participants object");
  }
  return parsed.participants as Record<string, Participant>;
}

async function writeParticipantsFile(
  p: Paths,
  participants: Record<string, Participant>,
): Promise<void> {
  await mkdir(p.fmarkDir(), { recursive: true });
  await writeFile(
    participantsFile(p),
    JSON.stringify({ participants }, null, 2),
    "utf8",
  );
}

export async function readParticipants(
  p: Paths,
): Promise<Record<string, Participant>> {
  try {
    return await readParticipantsFile(p);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  const cfg = await readConfig(p);
  return cfg.participants;
}

export async function writeParticipants(
  p: Paths,
  participants: Record<string, Participant>,
): Promise<void> {
  await writeParticipantsFile(p, participants);

  // Keep legacy config.json readers/tests coherent while the multi-path
  // split rolls forward. Fresh v0.5 folders may not have config.json at all.
  try {
    const cfg = await readConfig(p);
    cfg.participants = participants;
    await writeConfig(p, cfg);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
}

export async function ensureDefaultUserParticipant(
  p: Paths,
): Promise<Record<string, Participant>> {
  try {
    return await readParticipants(p);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  const participants = defaultParticipants();
  await writeParticipantsFile(p, participants);
  return participants;
}

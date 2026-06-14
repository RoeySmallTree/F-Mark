import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PARTICIPANT_AVATAR_DATA_URL_MAX_LENGTH,
  PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES,
  PARTICIPANT_AVATAR_IMAGE_MAX_BYTES,
} from "@f-mark/shared";
import { readConfig, writeConfig, type Participant } from "./project.js";
import type { Paths } from "./paths.js";
import { loadRuntimes } from "./runtimes/registry.js";
import { readActiveSession } from "./agents/activeSession.js";
import type { AgentStateStore } from "./services/agentState.js";

/** Hard cap on display-name length. Mirrors the JSON-schema constraint
 *  on /participants/register so direct kernel callers see the same
 *  rejection. Long enough for "GPT-4 Turbo (preview build)" but tight
 *  enough to prevent the 10K-char audit probe. */
export const PARTICIPANT_NAME_MAX = 60;

function validateName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("name must be non-empty");
  }
  if (trimmed.length > PARTICIPANT_NAME_MAX) {
    throw new Error(
      `name too long (${trimmed.length} chars, max ${PARTICIPANT_NAME_MAX})`,
    );
  }
  return trimmed;
}

async function assertKnownRuntimeWithKnownSet(
  p: Paths,
  runtimeId: string,
  knownRuntimeIds?: ReadonlySet<string>,
): Promise<void> {
  if (knownRuntimeIds?.has(runtimeId) === true) return;
  const file = await loadRuntimes(p.fmarkDir());
  if (!(runtimeId in file.runtimes)) {
    throw new Error(`unknown runtime_id: ${runtimeId}`);
  }
}

const AGENT_COLORS = [
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];

const USER_COLOR = "#3b82f6";

/* Segment after the kind prefix allows up to 16 chars. The longest builtin
   runtime slug is "opencode" (8) → spawned ids look like `ag-opencode-3a2f`
   (13 chars after `ag-`); the old {2,12} cap rejected exactly opencode. Keep
   in lockstep with the filename parsers (shared/filenames.ts,
   events/proseValidate.ts). */
const ID_PATTERN = /^(us|ag|sys|grp)-[a-z0-9-]{2,16}$/;

export interface RegisterAgentInput {
  name: string;
  suggested_id?: string;
  runtime_id?: string;
  knownRuntimeIds?: ReadonlySet<string>;
}

export interface RegisteredAgent {
  id: string;
  name: string;
  color: string;
}

export interface UpdateParticipantInput {
  name?: string;
  color?: string;
  avatar_data_url?: string | null;
}

export interface UpdatedParticipant {
  id: string;
  kind: "user" | "agent" | "sys";
  name: string;
  color: string;
  avatar_data_url?: string;
}

export const SYS_FORK_PARTICIPANT_ID = "sys-fork";
export const SYS_FORK_NAME = "Fork";
export const SYS_FORK_COLOR = "#71717a";

export async function ensureSystemForkParticipant(p: Paths): Promise<void> {
  let participants: Record<string, Participant>;
  try {
    participants = await readParticipants(p);
  } catch (err) {
    if (!isEnoent(err)) throw err;
    participants = defaultParticipants();
  }
  const existing = participants[SYS_FORK_PARTICIPANT_ID];
  if (
    existing !== undefined &&
    existing.kind === "sys" &&
    existing.name === SYS_FORK_NAME &&
    existing.color === SYS_FORK_COLOR
  ) {
    return;
  }
  const next: Record<string, Participant> = {
    ...participants,
    [SYS_FORK_PARTICIPANT_ID]: {
      kind: "sys",
      name: SYS_FORK_NAME,
      color: SYS_FORK_COLOR,
    },
  };
  await writeParticipants(p, next);
}

/* Wire shape: the persisted Participant from project.ts plus active_session
   read from `.f-mark/agents/{id}/active-session`. Users always get
   active_session: null. Agents that have never been linked (no spawn,
   no /agents/:id/link) also get null. */
export type ParticipantWithSession = Participant & {
  active_session: string | null;
};

interface ParticipantsFile {
  participants: Record<string, Participant>;
}

function isEnoent(err: unknown): boolean {
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

function defaultParticipants(): Record<string, Participant> {
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

async function writeParticipants(
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

export async function listParticipants(
  p: Paths,
  opts: { agentState?: AgentStateStore } = {},
): Promise<Record<string, ParticipantWithSession>> {
  const participants = await readParticipants(p);
  const out: Record<string, ParticipantWithSession> = {};
  for (const [id, part] of Object.entries(participants)) {
    if (part.kind === "agent") {
      const active_session =
        opts.agentState !== undefined
          ? await opts.agentState.readActiveSession(id)
          : await readActiveSession(join(p.fmarkDir(), "agents"), id);
      out[id] = { ...part, active_session };
    } else {
      out[id] = { ...part, active_session: null };
    }
  }
  return out;
}

function nextColor(existing: Record<string, Participant>): string {
  const used = new Set(Object.values(existing).map((x) => x.color.toLowerCase()));
  for (const c of AGENT_COLORS) {
    if (!used.has(c.toLowerCase())) return c;
  }
  return AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)]!;
}

function freshAgentId(existing: Record<string, Participant>): string {
  for (let i = 0; i < 64; i++) {
    const id = `ag-${randomBytes(2).toString("hex")}`;
    if (!(id in existing)) return id;
  }
  throw new Error("could not allocate unique agent id");
}

export async function registerAgent(
  p: Paths,
  input: RegisterAgentInput,
): Promise<RegisteredAgent> {
  const name = validateName(input.name);
  if (input.runtime_id !== undefined) {
    await assertKnownRuntimeWithKnownSet(
      p,
      input.runtime_id,
      input.knownRuntimeIds,
    );
  }
  const participants = await ensureDefaultUserParticipant(p);
  let id: string;
  if (input.suggested_id !== undefined) {
    if (!ID_PATTERN.test(input.suggested_id)) {
      throw new Error(`invalid participant id format: ${input.suggested_id}`);
    }
    if (input.suggested_id in participants) {
      throw new Error(`participant ${input.suggested_id} already registered`);
    }
    id = input.suggested_id;
  } else {
    id = freshAgentId(participants);
  }
  const color = nextColor(participants);
  const participant: Participant = {
    kind: "agent",
    name,
    color,
  };
  if (input.runtime_id !== undefined) {
    participant.runtime_id = input.runtime_id;
  }
  participants[id] = participant;
  await writeParticipants(p, participants);
  return { id, name, color };
}

/* Idempotent: backfills runtime_id on an existing participant. Used by the
   spawn flow so re-spawning under an existing participant still records the
   runtime, and so legacy participants registered before runtime_id existed
   pick it up the next time they spawn. */
export async function setParticipantRuntime(
  p: Paths,
  id: string,
  runtimeId: string,
  knownRuntimeIds?: ReadonlySet<string>,
): Promise<void> {
  await assertKnownRuntimeWithKnownSet(p, runtimeId, knownRuntimeIds);
  const participants = await readParticipants(p);
  const current = participants[id];
  if (current === undefined) return;
  if (current.runtime_id === runtimeId) return;
  current.runtime_id = runtimeId;
  participants[id] = current;
  await writeParticipants(p, participants);
}

export function isValidParticipantId(id: string): boolean {
  return ID_PATTERN.test(id);
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

const AVATAR_DATA_URL_PATTERN =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i;
const AVATAR_MIME_TYPES = new Set<string>(
  PARTICIPANT_AVATAR_DATA_URL_MIME_TYPES,
);

export function validateAvatarDataUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("avatar image cannot be empty");
  }
  if (trimmed.length > PARTICIPANT_AVATAR_DATA_URL_MAX_LENGTH) {
    throw new Error(
      `avatar image too large (max ${PARTICIPANT_AVATAR_IMAGE_MAX_BYTES} bytes)`,
    );
  }
  const match = AVATAR_DATA_URL_PATTERN.exec(trimmed);
  if (match === null) {
    throw new Error(
      "avatar image must be a PNG, JPEG, WebP, or GIF data URL",
    );
  }
  const mimeType = match[1]!.toLowerCase();
  if (!AVATAR_MIME_TYPES.has(mimeType)) {
    throw new Error(
      "avatar image must be a PNG, JPEG, WebP, or GIF data URL",
    );
  }
  const base64 = match[2]!;
  if (base64.length % 4 === 1) {
    throw new Error("avatar image data is not valid base64");
  }
  const byteLength = Buffer.from(base64, "base64").byteLength;
  if (byteLength === 0) {
    throw new Error("avatar image cannot be empty");
  }
  if (byteLength > PARTICIPANT_AVATAR_IMAGE_MAX_BYTES) {
    throw new Error(
      `avatar image too large (max ${PARTICIPANT_AVATAR_IMAGE_MAX_BYTES} bytes)`,
    );
  }
  return `data:${mimeType};base64,${base64}`;
}

export async function updateParticipant(
  p: Paths,
  id: string,
  input: UpdateParticipantInput,
): Promise<UpdatedParticipant> {
  if (!ID_PATTERN.test(id)) {
    throw new Error(`invalid participant id format: ${id}`);
  }
  const participants = await readParticipants(p);
  const current = participants[id];
  if (current === undefined) {
    throw new Error(`participant not found: ${id}`);
  }
  if (input.name !== undefined) {
    current.name = validateName(input.name);
  }
  if (input.color !== undefined) {
    if (!isValidHexColor(input.color)) {
      throw new Error(`invalid hex color: ${input.color}`);
    }
    current.color = input.color;
  }
  if (input.avatar_data_url !== undefined) {
    if (current.kind !== "user") {
      throw new Error("avatar image is only supported for user participants");
    }
    if (input.avatar_data_url === null) {
      delete current.avatar_data_url;
    } else {
      current.avatar_data_url = validateAvatarDataUrl(input.avatar_data_url);
    }
  }
  participants[id] = current;
  await writeParticipants(p, participants);
  const updated: UpdatedParticipant = {
    id,
    kind: current.kind,
    name: current.name,
    color: current.color,
  };
  if (current.avatar_data_url !== undefined) {
    updated.avatar_data_url = current.avatar_data_url;
  }
  return updated;
}

export async function setParticipantOverrides(
  p: Paths,
  id: string,
  patch: { model?: string | null; effort?: string | null },
): Promise<{ model_override?: string; effort_override?: string }> {
  if (!ID_PATTERN.test(id)) {
    throw new Error(`invalid participant id format: ${id}`);
  }
  const participants = await readParticipants(p);
  const current = participants[id];
  if (current === undefined) {
    throw new Error(`participant not found: ${id}`);
  }
  if (patch.model === null) {
    delete current.model_override;
  } else if (typeof patch.model === "string" && patch.model.length > 0) {
    current.model_override = patch.model;
  }
  if (patch.effort === null) {
    delete current.effort_override;
  } else if (typeof patch.effort === "string" && patch.effort.length > 0) {
    current.effort_override = patch.effort;
  }
  participants[id] = current;
  await writeParticipants(p, participants);
  return {
    model_override: current.model_override,
    effort_override: current.effort_override,
  };
}

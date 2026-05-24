import { randomBytes } from "node:crypto";
import { readConfig, writeConfig, type Participant } from "./project.js";
import type { Paths } from "./paths.js";
import { loadRuntimes } from "./runtimes/registry.js";

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

async function assertKnownRuntime(p: Paths, runtimeId: string): Promise<void> {
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

const ID_PATTERN = /^(us|ag|sys|grp)-[a-z0-9-]{2,12}$/;

export interface RegisterAgentInput {
  name: string;
  suggested_id?: string;
  runtime_id?: string;
}

export interface RegisteredAgent {
  id: string;
  name: string;
  color: string;
}

export interface UpdateParticipantInput {
  name?: string;
  color?: string;
}

export interface UpdatedParticipant {
  id: string;
  kind: "user" | "agent";
  name: string;
  color: string;
}

export async function listParticipants(
  p: Paths,
): Promise<Record<string, Participant>> {
  const cfg = await readConfig(p);
  return cfg.participants;
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
    await assertKnownRuntime(p, input.runtime_id);
  }
  const cfg = await readConfig(p);
  let id: string;
  if (input.suggested_id !== undefined) {
    if (!ID_PATTERN.test(input.suggested_id)) {
      throw new Error(`invalid participant id format: ${input.suggested_id}`);
    }
    if (input.suggested_id in cfg.participants) {
      throw new Error(`participant ${input.suggested_id} already registered`);
    }
    id = input.suggested_id;
  } else {
    id = freshAgentId(cfg.participants);
  }
  const color = nextColor(cfg.participants);
  const participant: Participant = {
    kind: "agent",
    name,
    color,
  };
  if (input.runtime_id !== undefined) {
    participant.runtime_id = input.runtime_id;
  }
  cfg.participants[id] = participant;
  await writeConfig(p, cfg);
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
): Promise<void> {
  await assertKnownRuntime(p, runtimeId);
  const cfg = await readConfig(p);
  const current = cfg.participants[id];
  if (current === undefined) return;
  if (current.runtime_id === runtimeId) return;
  current.runtime_id = runtimeId;
  cfg.participants[id] = current;
  await writeConfig(p, cfg);
}

export function isValidParticipantId(id: string): boolean {
  return ID_PATTERN.test(id);
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

export async function updateParticipant(
  p: Paths,
  id: string,
  input: UpdateParticipantInput,
): Promise<UpdatedParticipant> {
  if (!ID_PATTERN.test(id)) {
    throw new Error(`invalid participant id format: ${id}`);
  }
  const cfg = await readConfig(p);
  const current = cfg.participants[id];
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
  cfg.participants[id] = current;
  await writeConfig(p, cfg);
  return {
    id,
    kind: current.kind,
    name: current.name,
    color: current.color,
  };
}

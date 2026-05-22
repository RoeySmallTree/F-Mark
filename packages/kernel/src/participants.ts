import { randomBytes } from "node:crypto";
import { readConfig, writeConfig, type Participant } from "./project.js";
import type { Paths } from "./paths.js";

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
}

export interface RegisteredAgent {
  id: string;
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
  cfg.participants[id] = { kind: "agent", name: input.name, color };
  await writeConfig(p, cfg);
  return { id, name: input.name, color };
}

export function isValidParticipantId(id: string): boolean {
  return ID_PATTERN.test(id);
}

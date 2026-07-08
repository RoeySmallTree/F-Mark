import { createHash, randomBytes } from "node:crypto";
import type { Paths } from "../paths.js";
import type { Participant } from "../project.js";
import { loadRuntimes } from "../runtimes/registry.js";
import {
  ensureDefaultUserParticipant,
  readParticipants,
  writeParticipants,
} from "./store.js";
import type {
  ExistingParticipantContext,
  ForkAgentParticipantInput,
  ForkAgentParticipantResult,
  RegisteredAgent,
  RegisterAgentInput,
  UpdatedParticipant,
  UpdateParticipantInput,
} from "./types.js";
import {
  assertValidParticipantId,
  isValidHexColor,
  validateAvatarPreset,
  validateName,
} from "./validation.js";

const AGENT_COLORS = [
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];

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

function forkAgentId(input: ForkAgentParticipantInput, attempt: number): string {
  const hash = createHash("sha256")
    .update(
      `${input.forkSessionId}:${input.sourceParticipantId}:${input.sourceSessionId}:${attempt}`,
    )
    .digest("hex")
    .slice(0, 10);
  return `ag-f${hash}`;
}

function cloneForkAgentParticipant(source: Participant): Participant {
  const participant: Participant = {
    kind: "agent",
    name: source.name,
    color: source.color,
  };
  if (source.runtime_id !== undefined) {
    participant.runtime_id = source.runtime_id;
  }
  if (source.model_override !== undefined) {
    participant.model_override = source.model_override;
  }
  if (source.effort_override !== undefined) {
    participant.effort_override = source.effort_override;
  }
  return participant;
}

function toUpdatedParticipant(id: string, current: Participant): UpdatedParticipant {
  const updated: UpdatedParticipant = {
    id,
    kind: current.kind,
    name: current.name,
    color: current.color,
  };
  if (current.avatar_preset !== undefined) {
    updated.avatar_preset = current.avatar_preset;
  }
  return updated;
}

class ParticipantMutationService {
  constructor(private readonly p: Paths) {}

  async registerAgent(input: RegisterAgentInput): Promise<RegisteredAgent> {
    const name = validateName(input.name);
    if (input.runtime_id !== undefined) {
      await assertKnownRuntimeWithKnownSet(
        this.p,
        input.runtime_id,
        input.knownRuntimeIds,
      );
    }
    const participants = await ensureDefaultUserParticipant(this.p);
    const id = this.agentId(input, participants);
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
    await writeParticipants(this.p, participants);
    return { id, name, color };
  }

  async registerForkAgentParticipant(
    input: ForkAgentParticipantInput,
  ): Promise<ForkAgentParticipantResult> {
    const participants = await readParticipants(this.p);
    const source = participants[input.sourceParticipantId];
    if (source === undefined || source.kind !== "agent") {
      throw new Error(`agent participant not found: ${input.sourceParticipantId}`);
    }
    for (let attempt = 0; attempt < 64; attempt++) {
      const id = forkAgentId(input, attempt);
      if (participants[id] !== undefined) continue;
      const participant = cloneForkAgentParticipant(source);
      participants[id] = participant;
      await writeParticipants(this.p, participants);
      return { id, participant };
    }
    throw new Error(
      `could not allocate fork agent id for ${input.sourceParticipantId}`,
    );
  }

  async setRuntime(
    id: string,
    runtimeId: string,
    knownRuntimeIds?: ReadonlySet<string>,
  ): Promise<void> {
    await assertKnownRuntimeWithKnownSet(this.p, runtimeId, knownRuntimeIds);
    const participants = await readParticipants(this.p);
    const current = participants[id];
    if (current === undefined) return;
    if (current.runtime_id === runtimeId) return;
    current.runtime_id = runtimeId;
    participants[id] = current;
    await writeParticipants(this.p, participants);
  }

  async updateParticipant(
    id: string,
    input: UpdateParticipantInput,
  ): Promise<UpdatedParticipant> {
    const { participants, current } = await this.loadExistingParticipant(id);
    if (input.name !== undefined) {
      current.name = validateName(input.name);
    }
    if (input.color !== undefined) {
      if (!isValidHexColor(input.color)) {
        throw new Error(`invalid hex color: ${input.color}`);
      }
      current.color = input.color;
    }
    if (input.avatar_preset !== undefined) {
      if (current.kind !== "user") {
        throw new Error("avatar preset is only supported for user participants");
      }
      if (input.avatar_preset === null) {
        delete current.avatar_preset;
      } else {
        current.avatar_preset = validateAvatarPreset(input.avatar_preset);
      }
    }
    participants[id] = current;
    await writeParticipants(this.p, participants);
    return toUpdatedParticipant(id, current);
  }

  async setOverrides(
    id: string,
    patch: { model?: string | null; effort?: string | null },
  ): Promise<{ model_override?: string; effort_override?: string }> {
    const { participants, current } = await this.loadExistingParticipant(id);
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
    await writeParticipants(this.p, participants);
    return {
      model_override: current.model_override,
      effort_override: current.effort_override,
    };
  }

  private agentId(
    input: RegisterAgentInput,
    participants: Record<string, Participant>,
  ): string {
    if (input.suggested_id === undefined) {
      return freshAgentId(participants);
    }
    assertValidParticipantId(input.suggested_id);
    if (input.suggested_id in participants) {
      throw new Error(`participant ${input.suggested_id} already registered`);
    }
    return input.suggested_id;
  }

  private async loadExistingParticipant(
    id: string,
  ): Promise<ExistingParticipantContext> {
    assertValidParticipantId(id);
    const participants = await readParticipants(this.p);
    const current = participants[id];
    if (current === undefined) {
      throw new Error(`participant not found: ${id}`);
    }
    return { participants, current };
  }
}

function mutationService(p: Paths): ParticipantMutationService {
  return new ParticipantMutationService(p);
}

export async function registerForkAgentParticipant(
  p: Paths,
  input: ForkAgentParticipantInput,
): Promise<ForkAgentParticipantResult> {
  return mutationService(p).registerForkAgentParticipant(input);
}

export async function registerAgent(
  p: Paths,
  input: RegisterAgentInput,
): Promise<RegisteredAgent> {
  return mutationService(p).registerAgent(input);
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
  await mutationService(p).setRuntime(id, runtimeId, knownRuntimeIds);
}

export async function updateParticipant(
  p: Paths,
  id: string,
  input: UpdateParticipantInput,
): Promise<UpdatedParticipant> {
  return mutationService(p).updateParticipant(id, input);
}

export async function setParticipantOverrides(
  p: Paths,
  id: string,
  patch: { model?: string | null; effort?: string | null },
): Promise<{ model_override?: string; effort_override?: string }> {
  return mutationService(p).setOverrides(id, patch);
}

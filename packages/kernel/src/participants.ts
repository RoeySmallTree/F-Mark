import type {
  ForkAgentParticipantInput as ForkAgentParticipantInputFields,
  ForkAgentParticipantResult as ForkAgentParticipantResultFields,
  RegisteredAgent as RegisteredAgentFields,
  RegisterAgentInput as RegisterAgentInputFields,
  UpdatedParticipant as UpdatedParticipantFields,
  UpdateParticipantInput as UpdateParticipantInputFields,
} from "./participants/types.js";
import type { Paths } from "./paths.js";
import {
  registerAgent as registerAgentWithService,
  registerForkAgentParticipant as registerForkAgentParticipantWithService,
  setParticipantOverrides as setParticipantOverridesWithService,
  setParticipantRuntime as setParticipantRuntimeWithService,
  updateParticipant as updateParticipantWithService,
} from "./participants/service.js";

export {
  ensureSystemForkParticipant,
  listParticipants,
  SYS_FORK_PARTICIPANT_ID,
} from "./participants/registry.js";
export { ensureDefaultUserParticipant } from "./participants/store.js";
export {
  isValidHexColor,
  isValidParticipantId,
  validateAvatarPreset,
  validateName,
} from "./participants/validation.js";
export type { ParticipantWithSession } from "./participants/types.js";

export interface RegisterAgentInput extends RegisterAgentInputFields {}

export interface RegisteredAgent extends RegisteredAgentFields {}

export interface ForkAgentParticipantInput
  extends ForkAgentParticipantInputFields {}

export interface ForkAgentParticipantResult
  extends ForkAgentParticipantResultFields {}

export interface UpdateParticipantInput extends UpdateParticipantInputFields {}

export interface UpdatedParticipant extends UpdatedParticipantFields {}

export async function registerForkAgentParticipant(
  p: Paths,
  input: ForkAgentParticipantInput,
): Promise<ForkAgentParticipantResult> {
  return registerForkAgentParticipantWithService(p, input);
}

export async function registerAgent(
  p: Paths,
  input: RegisterAgentInput,
): Promise<RegisteredAgent> {
  return registerAgentWithService(p, input);
}

export async function setParticipantRuntime(
  p: Paths,
  id: string,
  runtimeId: string,
  knownRuntimeIds?: ReadonlySet<string>,
): Promise<void> {
  await setParticipantRuntimeWithService(p, id, runtimeId, knownRuntimeIds);
}

export async function updateParticipant(
  p: Paths,
  id: string,
  input: UpdateParticipantInput,
): Promise<UpdatedParticipant> {
  return updateParticipantWithService(p, id, input);
}

export async function setParticipantOverrides(
  p: Paths,
  id: string,
  patch: { model?: string | null; effort?: string | null },
): Promise<{ model_override?: string; effort_override?: string }> {
  return setParticipantOverridesWithService(p, id, patch);
}

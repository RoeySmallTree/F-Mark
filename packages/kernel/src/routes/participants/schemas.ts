import {
  participantNameSchema,
  participantProfilePatchBodySchema,
} from "../participantProfileSchema.js";

export const registerAgentRouteSchema = {
  body: {
    type: "object",
    required: ["kind", "name"],
    properties: {
      kind: { type: "string", enum: ["agent"] },
      name: participantNameSchema,
      suggested_id: { type: "string" },
    },
  },
};

export const updateParticipantRouteSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", minLength: 1 } },
  },
  body: {
    ...participantProfilePatchBodySchema,
  },
};

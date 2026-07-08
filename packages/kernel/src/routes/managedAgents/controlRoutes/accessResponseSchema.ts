export const accessResponseRouteOptions = {
  schema: {
    params: {
      type: "object",
      required: ["id", "requestId"],
      properties: {
        id: { type: "string", minLength: 1 },
        requestId: { type: "string", minLength: 1 },
      },
    },
    body: {
      type: "object",
      required: ["session_id", "participant_id", "decision"],
      additionalProperties: false,
      properties: {
        session_id: { type: "string", minLength: 1 },
        participant_id: { type: "string", minLength: 1 },
        decision: { enum: ["approve", "deny"] },
        option_id: { type: "string" },
        message: { type: "string" },
        path_id: { type: "string" },
        root: { type: "string" },
      },
    },
  },
} as const;

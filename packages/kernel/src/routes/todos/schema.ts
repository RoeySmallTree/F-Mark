export const TODO_EVENT_SCHEMA = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
  body: {
    type: "object",
    required: ["participant_id", "id", "title", "status"],
    additionalProperties: false,
    properties: {
      participant_id: { type: "string", minLength: 1 },
      id: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      body: { type: "string" },
      status: {
        type: "string",
        enum: ["open", "wip", "done", "removed"],
      },
      assigned_to: { type: "string" },
      parent_id: { type: "string" },
      supersedes: { type: "string" },
      append_to: { type: "string", minLength: 1 },
      path_id: { type: "string" },
      root: { type: "string" },
    },
  },
} as const;

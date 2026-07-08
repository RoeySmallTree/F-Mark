export const participantNameSchema = {
  type: "string",
  minLength: 1,
  maxLength: 60,
};

const participantColorSchema = {
  type: "string",
  pattern: "^#[0-9a-fA-F]{6}$",
};

const participantAvatarPresetSchema = {
  anyOf: [
    {
      type: "string",
      pattern: "^(0[1-9]|[1-9][0-9]|100)$",
    },
    { type: "null" },
  ],
};

export const participantProfilePatchBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: participantNameSchema,
    color: participantColorSchema,
    avatar_preset: participantAvatarPresetSchema,
  },
};

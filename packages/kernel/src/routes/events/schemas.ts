import type { FastifySchema } from "fastify";

const ID_PARAMS_SCHEMA = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

const ROOT_SCOPE_PROPS = {
  path_id: { type: "string" },
  root: { type: "string" },
} as const;

const SUBAGENT_STATUS_ENUM = [
  "started",
  "running",
  "completed",
  "failed",
  "cancelled",
  "unknown",
] as const;

const SUBAGENT_SOURCE_ENUM = [
  "hook",
  "transcript",
  "terminal-stream",
  "mcp-middleware",
  "unknown",
] as const;

const SUBAGENT_SOURCE_CONFIDENCE_ENUM = ["high", "medium", "low"] as const;

const subagentBaseProps = {
  participant_id: { type: "string", minLength: 1 },
  parent_participant_id: { type: "string", minLength: 1 },
  parent_runtime_id: { anyOf: [{ type: "string" }, { type: "null" }] },
  parent_runtime_session_id: { type: "string" },
  parent_turn_id: { type: "string" },
  parent_tool_use_id: { type: "string" },
  subagent_id: { type: "string", minLength: 1, maxLength: 160 },
  correlation_id: { type: "string", minLength: 1, maxLength: 180 },
  sequence: { type: "integer", minimum: 0 },
  source: { enum: SUBAGENT_SOURCE_ENUM },
  source_confidence: { enum: SUBAGENT_SOURCE_CONFIDENCE_ENUM },
  raw: {},
  append_to: { type: "string", minLength: 1 },
  ...ROOT_SCOPE_PROPS,
} as const;

export const proseSchema = {
  params: ID_PARAMS_SCHEMA,
  body: {
    type: "object",
    required: ["participant_id", "content"],
    additionalProperties: false,
    properties: {
      participant_id: { type: "string" },
      content: { type: "string" },
      name: { type: "string" },
      append_to: { type: "string" },
      mode: { enum: ["content", "comment"] },
      lines: {
        type: "array",
        items: { type: "integer", minimum: 1 },
        minItems: 2,
        maxItems: 2,
      },
      removed: { enum: [true, false] },
      file_path: { type: "string" },
      diff_hunk: { type: "string" },
      diff_base: { type: "string" },
      line_context: {
        type: "object",
        required: ["selected", "sha256"],
        additionalProperties: false,
        properties: {
          selected: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          sha256: { type: "string" },
        },
      },
      in_reply_to: { type: "string" },
      supersedes: {
        anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
      },
      timestamp: { type: "string", pattern: "^\\d{8}T\\d{6}(\\.\\d+)?Z$" },
      mentions: {
        type: "array",
        items: {
          type: "object",
          required: ["participant_id", "display_name", "token"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string" },
            display_name: { type: "string" },
            token: { type: "string" },
          },
        },
      },
      arbitrary: { enum: [true, false] },
      source: { enum: ["mcp", "hook", "manual"] },
      ...ROOT_SCOPE_PROPS,
    },
  },
} satisfies FastifySchema;

export const toolUseSchema = {
  params: ID_PARAMS_SCHEMA,
  body: {
    type: "object",
    required: [
      "participant_id",
      "tool_name",
      "tool_use_id",
      "input",
      "success",
    ],
    additionalProperties: false,
    properties: {
      participant_id: { type: "string", minLength: 1 },
      tool_name: { type: "string", minLength: 1, maxLength: 80 },
      tool_use_id: { type: "string", minLength: 1, maxLength: 80 },
      input: {},
      result: {},
      success: { type: "boolean" },
      duration_ms: { type: "number" },
      append_to: { type: "string", minLength: 1 },
      ...ROOT_SCOPE_PROPS,
    },
  },
} satisfies FastifySchema;

export const subagentRunSchema = {
  params: ID_PARAMS_SCHEMA,
  body: {
    type: "object",
    required: [
      "participant_id",
      "schema",
      "parent_participant_id",
      "parent_runtime_id",
      "subagent_id",
      "name",
      "status",
      "correlation_id",
      "sequence",
      "source",
      "source_confidence",
    ],
    additionalProperties: false,
    properties: {
      ...subagentBaseProps,
      schema: { const: "fmark.subagent-run.v1" },
      name: { type: "string", minLength: 1, maxLength: 160 },
      role: { type: "string", maxLength: 160 },
      prompt_preview: { type: "string", maxLength: 4000 },
      status: { enum: SUBAGENT_STATUS_ENUM },
      started_at: { type: "string" },
      ended_at: { type: "string" },
      transcript_path: { type: "string" },
    },
  },
} satisfies FastifySchema;

export const subagentOutputSchema = {
  params: ID_PARAMS_SCHEMA,
  body: {
    type: "object",
    required: [
      "participant_id",
      "schema",
      "parent_participant_id",
      "parent_runtime_id",
      "subagent_id",
      "content",
      "correlation_id",
      "sequence",
      "source",
      "source_confidence",
    ],
    additionalProperties: false,
    properties: {
      ...subagentBaseProps,
      schema: { const: "fmark.subagent-output.v1" },
      name: { type: "string", maxLength: 160 },
      content: { type: "string" },
      arbitrary: { enum: [true, false] },
      status: { enum: SUBAGENT_STATUS_ENUM },
    },
  },
} satisfies FastifySchema;

export const accessRequestSchema = {
  params: ID_PARAMS_SCHEMA,
  body: {
    type: "object",
    required: [
      "participant_id",
      "schema",
      "request_id",
      "status",
      "request_type",
      "runtime_id",
      "hook_event_name",
      "title",
      "response_channel",
      "created_at",
    ],
    additionalProperties: false,
    properties: {
      participant_id: { type: "string", minLength: 1 },
      schema: { const: "fmark.access-request.v1" },
      request_id: { type: "string", minLength: 1, maxLength: 120 },
      status: {
        enum: [
          "open",
          "approved",
          "denied",
          "resolved",
          "expired",
          "bridge-timeout",
        ],
      },
      request_type: {
        enum: [
          "permission",
          "trust",
          "config",
          "tool",
          "command",
          "unknown",
        ],
      },
      runtime_id: { anyOf: [{ type: "string" }, { type: "null" }] },
      runtime_session_id: { type: "string" },
      runtime_turn_id: { type: "string" },
      hook_event_name: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      message: { type: "string" },
      tool_name: { type: "string" },
      tool_input: {},
      command: { type: "string" },
      permission_mode: { type: "string" },
      suggestions: { type: "array", items: {} },
      cwd: { type: "string" },
      transcript_path: { type: "string" },
      response_channel: { enum: ["hook", "terminal", "none"] },
      raw: {},
      created_at: { type: "string" },
      ...ROOT_SCOPE_PROPS,
    },
  },
} satisfies FastifySchema;

export const accessResponseSchema = {
  params: ID_PARAMS_SCHEMA,
  body: {
    type: "object",
    required: [
      "participant_id",
      "schema",
      "request_id",
      "decision",
      "status",
      "delivered",
      "delivery",
      "responded_at",
    ],
    additionalProperties: false,
    properties: {
      participant_id: { type: "string", minLength: 1 },
      schema: { const: "fmark.access-response.v1" },
      request_id: { type: "string", minLength: 1, maxLength: 120 },
      decision: {
        enum: ["approve", "deny", "resolved", "expired", "bridge-timeout"],
      },
      status: {
        enum: [
          "approved",
          "denied",
          "resolved",
          "expired",
          "bridge-timeout",
        ],
      },
      delivered: { type: "boolean" },
      delivery: { enum: ["hook", "terminal", "none"] },
      option_id: { type: "string" },
      terminal_input: { type: "string" },
      scope: { enum: ["once", "session", "always", "default"] },
      message: { type: "string" },
      error: { type: "string" },
      responded_at: { type: "string" },
      ...ROOT_SCOPE_PROPS,
    },
  },
} satisfies FastifySchema;

export const choicesSchema = {
  body: {
    type: "object",
    required: ["participant_id", "id", "question", "options", "multi"],
    additionalProperties: false,
    properties: {
      participant_id: { type: "string" },
      id: { type: "string" },
      question: { type: "string" },
      options: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "label"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            html: { type: "string", minLength: 1 },
          },
        },
      },
      multi: { type: "boolean" },
      supersedes: { type: "string" },
      append_to: { type: "string", minLength: 1 },
      ...ROOT_SCOPE_PROPS,
    },
  },
} satisfies FastifySchema;

export const choiceSchema = {
  body: {
    type: "object",
    required: ["participant_id", "choices_id", "selected"],
    additionalProperties: false,
    properties: {
      participant_id: { type: "string" },
      choices_id: { type: "string" },
      selected: {
        type: "array",
        items: { type: "string" },
      },
      ...ROOT_SCOPE_PROPS,
    },
  },
} satisfies FastifySchema;

export const turnEndSchema = {
  body: {
    type: "object",
    required: ["participant_id"],
    properties: {
      participant_id: { type: "string" },
      source: { enum: ["mcp", "hook", "manual"] },
      ...ROOT_SCOPE_PROPS,
    },
  },
} satisfies FastifySchema;

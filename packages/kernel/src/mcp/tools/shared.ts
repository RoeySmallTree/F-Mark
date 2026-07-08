import type {
  CallToolResult,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";

export const readOnlyToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
} satisfies ToolAnnotations;

export const mutatingToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
} satisfies ToolAnnotations;

export const idempotentMutationToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
} satisfies ToolAnnotations;

export function textResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function compactBody(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

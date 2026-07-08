export type TurnBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
      result?: unknown;
      is_error?: boolean;
    };

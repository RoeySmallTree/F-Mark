import type {
  PostAccessRequestBody,
  PostAccessResponseBody,
  PostChoiceBody,
  PostChoicesBody,
  PostProseBody,
  PostSubagentOutputBody,
  PostSubagentRunBody,
  PostToolUseBody,
  PostTurnEndBody,
} from "@f-mark/shared";

export type ScopedBody = { path_id?: string; root?: string };
export type ProseBody = PostProseBody & ScopedBody;
export type ToolUseBody = PostToolUseBody & ScopedBody;
export type SubagentRunBody = PostSubagentRunBody & ScopedBody;
export type SubagentOutputBody = PostSubagentOutputBody & ScopedBody;
export type TurnEndBody = PostTurnEndBody & ScopedBody;
export type AccessRequestBody = PostAccessRequestBody & ScopedBody;
export type AccessResponseBody = PostAccessResponseBody & ScopedBody;
export type ChoicesBody = PostChoicesBody & ScopedBody;
export type ChoiceBody = PostChoiceBody & ScopedBody;

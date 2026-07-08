import type { AccessRequestPayload as SharedAccessRequestPayload } from "@f-mark/shared";

export type AutoStreamKind = "assistant" | "user";

export interface AssistantStdin {
  session_id?: string;
  transcript_path?: string;
  cwd: string;
  hook_event_name: string;
  stop_hook_active?: boolean;
}

export interface UserStdin {
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  user_input?: string;
}

export type HookPayload = AssistantStdin | UserStdin | Record<string, unknown>;

export interface AutoStreamOptions {
  env?: NodeJS.ProcessEnv;
}

export type AccessRequestPayload = SharedAccessRequestPayload;

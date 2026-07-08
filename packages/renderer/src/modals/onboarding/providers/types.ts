import type {
  IntegrationPreflightResponse,
  IntegrationScope,
  IntegrationStatus,
} from "@f-mark/shared";

export type Scope = Extract<IntegrationScope, "user" | "project">;

export interface RuntimeStatus {
  loading: boolean;
  applying: boolean;
  preflight: IntegrationPreflightResponse | null;
  error: string | null;
}

export const EMPTY_RUNTIME_STATUS: RuntimeStatus = {
  loading: false,
  applying: false,
  preflight: null,
  error: null,
};

export type StatusValue = IntegrationStatus | "unknown" | undefined;

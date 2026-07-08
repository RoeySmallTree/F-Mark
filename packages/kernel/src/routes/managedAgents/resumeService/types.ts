import type { EnsureManagedAgentsResponse } from "@f-mark/shared";
import type { Paths } from "../../../paths.js";
import type { PresenceTracker } from "../../../presence/tracker.js";
import type { TmuxManager } from "../../../tmux/manager.js";
import type { ManagedAgentRootBinding } from "../types.js";

export type EnsureSkippedReason =
  EnsureManagedAgentsResponse["skipped"][number]["reason"];

export type ResumeResult =
  | {
      ok: true;
      participant_id: string;
      tmux_session: string;
      resumed: boolean;
    }
  | {
      ok: false;
      participant_id: string;
      reason: EnsureSkippedReason;
      detail?: string;
    };

export type EnsureParticipantResult =
  | { kind: "ignore" }
  | { kind: "skip"; entry: EnsureManagedAgentsResponse["skipped"][number] }
  | {
      kind: "ready";
      resume: Extract<ResumeResult, { ok: true }>;
      entry: EnsureManagedAgentsResponse["resumed"][number];
    };

export interface ResumePaneInput {
  participantId: string;
  sessionId: string;
  binding: ManagedAgentRootBinding;
  idleOnly?: boolean;
  /** When set, avoids re-listing tmux for every agent in ensure-for-session. */
  liveTmuxSessions?: ReadonlySet<string>;
}

export interface ResumePaneDeps {
  tmux: TmuxManager;
  tracker: PresenceTracker;
  integrationEnv: NodeJS.ProcessEnv;
  ensureLaunchProjectConnection(p: Paths): Promise<void>;
  firstUserParticipantId(p: Paths): Promise<string | undefined>;
  publishAgentUpdated(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<void>;
  scheduleTerminalAccessPolling(input: {
    participantId: string;
    runtimeId: string | null;
    binding?: ManagedAgentRootBinding | null;
  }): void;
  scheduleCodexLiveTextPolling(input: {
    participantId: string;
    sessionId: string | null | undefined;
    runtimeId: string | null | undefined;
    binding?: ManagedAgentRootBinding | null;
    reset?: boolean;
  }): void;
  paneAlive(sessionName: string): boolean;
}

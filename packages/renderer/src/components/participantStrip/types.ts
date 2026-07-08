import type {
  AgentActivityState,
  AgentPaneLifecycle,
  AgentSessionMembershipState,
  CurrentRuntimeState,
  Participant,
} from "@f-mark/shared";
import type { AgentSpawnValue } from "../../hooks/useAgentSpawn.js";

export interface ParticipantStripProps {
  variant?: "compose" | "topbar";
  activeAgentIds?: ReadonlySet<string>;
  showGlobalActions?: boolean;
  onOpenSearch?: () => void;
  onOpenSettings?: () => void;
  searchLabel?: string;
}

export type AgentActionMenuPlacement = "below" | "above";

export interface AgentActionMenuTriggerRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AgentActionMenuAnchor {
  triggerRect: AgentActionMenuTriggerRect;
  top: number;
  left: number;
  placement: AgentActionMenuPlacement;
  maxHeight: number;
}

export interface AgentChipModel {
  participant_id: string;
  name: string;
  runtime_id: string | null;
  tmux_session: string | null;
  isManaged: boolean;
  pendingAccessCount: number;
  runtime_state?: CurrentRuntimeState;
  access_mode?: string;
  activity_state?: AgentActivityState;
  controllable?: boolean;
  pane_lifecycle?: AgentPaneLifecycle;
  membership_state?: AgentSessionMembershipState;
}

export type UserParticipant = Participant & { id: string; kind: "user" };

export interface ParticipantStripSpawnControls
  extends Pick<
    AgentSpawnValue,
    | "runtimes"
    | "onSpawnRuntime"
    | "onManageRuntimes"
    | "accessModeForRuntime"
    | "accessModeOptionsForRuntime"
    | "setAccessModeForRuntime"
    | "modelForRuntime"
    | "effortForRuntime"
    | "modelOptionsForRuntime"
    | "effortOptionsForRuntime"
    | "setModelForRuntime"
    | "setEffortForRuntime"
    | "spawnDisabledReason"
  > {
  runtimeSpawnError: string | null;
  managedAgentsDisabledReason: string | null;
}

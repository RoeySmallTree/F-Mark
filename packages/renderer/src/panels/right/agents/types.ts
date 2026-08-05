import type {
  AgentStatusRow,
  AnyEventRecord,
  EffortDescriptor,
  ModelDescriptor,
  Participant,
} from "@f-mark/shared";
import type { RootScope } from "../../../api/client.js";
import type { ConfirmedIntent } from "../../../confirm/index.js";

export type BusyAction =
  | "pause"
  | "resume"
  | "rename"
  | "recolor"
  | "reconnect"
  | "compact"
  | "clear"
  | "interrupt"
  | "goodbye";

export interface BusyState {
  id: string;
  action: BusyAction;
}

export interface RenameDraft {
  id: string;
  value: string;
}

export interface RuntimeOptions {
  models: ModelDescriptor[];
  efforts: EffortDescriptor[];
}

export interface TerminalOverlayController {
  openTerminalOverlay(tmuxSession: string): void;
}

export interface RightAgentsController {
  agents: AgentStatusRow[];
  removedAgents: AgentStatusRow[];
  loading: boolean;
  error: string | null;
  busy: BusyState | null;
  editing: RenameDraft | null;
  pickingColorFor: string | null;
  runtimeOptions: Record<string, RuntimeOptions>;
  runtimeOptionsLoading: Record<string, boolean>;
  participants: Record<string, Participant>;
  events: AnyEventRecord[];
  currentScope: RootScope | null;
  setEditing(next: RenameDraft | null): void;
  setPickingColorFor(
    updater: string | null | ((current: string | null) => string | null),
  ): void;
  refresh(): Promise<void>;
  loadRuntimeOptions(agent: AgentStatusRow): Promise<void>;
  renameAgent(agent: AgentStatusRow, displayName: string): Promise<void>;
  recolorAgent(agent: AgentStatusRow, color: string): Promise<void>;
  setRuntimeModel(agent: AgentStatusRow, model: string): Promise<void>;
  setRuntimeEffort(agent: AgentStatusRow, effort: string): Promise<void>;
  setAccessMode(agent: AgentStatusRow, mode: string): Promise<void>;
  pauseOrResume(agent: AgentStatusRow): Promise<void>;
  interrupt(agent: AgentStatusRow): Promise<void>;
  compact(agent: AgentStatusRow): Promise<void>;
  clear(agent: AgentStatusRow): Promise<void>;
  reconnect(agent: AgentStatusRow): Promise<void>;
  goodbye(agent: AgentStatusRow, intent: ConfirmedIntent): Promise<void>;
}

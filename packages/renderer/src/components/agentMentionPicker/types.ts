import type {
  AgentConnectionState,
  AgentStatusRow,
  Participant,
  ProseMention,
} from "@f-mark/shared";

export interface AgentMentionPickerProps {
  anchorRect: DOMRect;
  sessionId: string | null;
  token: string | null;
  participants: Record<string, Participant>;
  selectedIds: Set<string>;
  onSelect(mention: ProseMention): void;
  onClose(): void;
}

export interface MentionRow extends ProseMention {
  connectionState: AgentConnectionState;
  managed: boolean;
  paused: boolean;
}

export interface AgentMentionPickerController {
  agents: AgentStatusRow[] | null;
  rows: MentionRow[];
  busyId: string | null;
  refresh(): Promise<void>;
  resume(row: MentionRow): Promise<void>;
  reconnect(row: MentionRow): Promise<void>;
}

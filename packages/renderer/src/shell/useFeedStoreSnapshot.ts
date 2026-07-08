import type { AnyEventRecord, ManagedAgent, Participant } from "@f-mark/shared";
import { useStore, type ViewMode } from "../state/store.js";
import type { AgentPresence } from "../state/presence.js";

export interface FeedStoreSnapshot {
  events: AnyEventRecord[];
  eventsLoadingSessionId: string | null;
  participants: Record<string, Participant>;
  commentTarget: unknown;
  viewMode: ViewMode;
  currentSessionId: string | null;
  selectedPath: string | null;
  selectedPathId: string | null;
  presence: Record<string, AgentPresence>;
  managedAgents: ManagedAgent[];
  lastSeenBySession: Record<string, string>;
  markSeen(filename: string): void;
  followMode: boolean;
  setFollowMode(followMode: boolean): void;
  scrollToBottomTick: number;
}

export function useFeedStoreSnapshot(): FeedStoreSnapshot {
  return {
    events: useStore((s) => s.events),
    eventsLoadingSessionId: useStore((s) => s.eventsLoadingSessionId),
    participants: useStore((s) => s.participants),
    commentTarget: useStore((s) => s.commentTarget),
    viewMode: useStore((s) => s.viewMode),
    currentSessionId: useStore((s) => s.currentSessionId),
    selectedPath: useStore((s) => s.selectedPath),
    selectedPathId: useStore((s) => s.selectedPathId),
    presence: useStore((s) => s.presence),
    managedAgents: useStore((s) => s.managedAgents),
    lastSeenBySession: useStore((s) => s.lastSeenBySession),
    markSeen: useStore((s) => s.markSeen),
    followMode: useStore((s) => s.followMode),
    setFollowMode: useStore((s) => s.setFollowMode),
    scrollToBottomTick: useStore((s) => s.scrollToBottomTick),
  };
}

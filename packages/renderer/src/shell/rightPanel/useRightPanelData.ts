import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { RightTabKey } from "../../state/store.js";
import { useStore } from "../../state/store.js";
import { aggregate } from "../../state/aggregate.js";
import type { State } from "../../state/storeTypes.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

type StoreSnapshot = Pick<
  State,
  | "activePath"
  | "commentTarget"
  | "currentSessionId"
  | "events"
  | "participants"
  | "rightScrollBySession"
  | "rightTab"
  | "sessions"
  | "setRightScroll"
  | "setRightTab"
>;

export function useRightPanelData(): {
  activePath: string | null;
  agentsCount: number;
  commentTarget: ReturnType<typeof useStore.getState>["commentTarget"];
  commentsCount: number;
  currentSessionId: string | null;
  namedCount: number;
  rightTab: ReturnType<typeof useStore.getState>["rightTab"];
  scrollMap: Record<string, number>;
  setRightScroll: (scrollTop: number) => void;
  setRightTab: (value: ReturnType<typeof useStore.getState>["rightTab"]) => void;
  slug: string;
  tabCounts: Partial<Record<RightTabKey, number>>;
} {
  const state = useRightPanelStoreSnapshot();

  const slug = useMemo(
    () => sessionSlug(state.sessions, state.currentSessionId),
    [state.sessions, state.currentSessionId],
  );
  const agg = useMemo(() => aggregate(state.events), [state.events]);
  const commentsCount = useMemo(() => {
    let total = 0;
    for (const list of agg.commentsByTarget.values()) total += list.length;
    for (const list of agg.fileCommentsByPath.values()) total += list.length;
    return total;
  }, [agg]);
  const namedCount = agg.named.length;
  const agentsCount = useMemo(
    () => activeSessionAgentCount(state.participants, state.currentSessionId),
    [state.currentSessionId, state.participants],
  );

  return {
    activePath: state.activePath,
    agentsCount,
    commentTarget: state.commentTarget,
    commentsCount,
    currentSessionId: state.currentSessionId,
    namedCount,
    rightTab: state.rightTab,
    scrollMap: state.rightScrollBySession,
    setRightScroll: state.setRightScroll,
    setRightTab: state.setRightTab,
    slug,
    tabCounts: {
      comments: commentsCount,
      named: namedCount,
      agents: agentsCount,
    },
  };
}

function useRightPanelStoreSnapshot(): StoreSnapshot {
  return useStore(
    useShallow((state): StoreSnapshot => ({
      activePath: state.activePath,
      commentTarget: state.commentTarget,
      currentSessionId: state.currentSessionId,
      events: state.events,
      participants: state.participants,
      rightScrollBySession: state.rightScrollBySession,
      rightTab: state.rightTab,
      sessions: state.sessions,
      setRightScroll: state.setRightScroll,
      setRightTab: state.setRightTab,
    })),
  );
}

function sessionSlug(
  sessions: StoreSnapshot["sessions"],
  currentSessionId: string | null,
): string {
  return (
    sessions.find((session) => session.id === currentSessionId)?.slug ??
    "no session"
  );
}

function activeSessionAgentCount(
  participants: StoreSnapshot["participants"],
  currentSessionId: string | null,
): number {
  return Object.values(participants).filter(
    (participant) =>
      participant.kind === NO_LOOSE_STRING_VALUES.agent &&
      participant.active_session === currentSessionId,
  ).length;
}

import {
  useCallback,
  useMemo,
  useState,
  type JSX,
} from "react";
import { ToolboxAccordionProvider } from "../cards/toolboxAccordion.js";
import { aggregate } from "../state/aggregate.js";
import { FeedAgentTailItems } from "./FeedAgentTailItems.js";
import { FeedComposeDock } from "./FeedComposeDock.js";
import { FeedEmptyState } from "./FeedEmptyState.js";
import { FeedRows } from "./FeedRows.js";
import { useFeedAgentTails } from "./useFeedAgentTails.js";
import { useFeedProjection } from "./useFeedProjection.js";
import { useFeedScrollController } from "./useFeedScrollController.js";
import { useFeedStoreSnapshot } from "./useFeedStoreSnapshot.js";

export function Feed(): JSX.Element {
  const store = useFeedStoreSnapshot();

  const eventsLoading =
    store.currentSessionId !== null &&
    store.eventsLoadingSessionId === store.currentSessionId;
  const agg = useMemo(() => aggregate(store.events), [store.events]);
  const { items, freshKeys, consumedFilenames } = useFeedProjection(
    agg,
    store.viewMode,
  );
  const agentTails = useFeedAgentTails({
    events: store.events,
    participants: store.participants,
    currentSessionId: store.currentSessionId,
    viewMode: store.viewMode,
    presence: store.presence,
    managedAgents: store.managedAgents,
  });
  const savedAnchor =
    store.currentSessionId !== null
      ? store.lastSeenBySession[store.currentSessionId]
      : undefined;
  const scroll = useFeedScrollController({
    currentSessionId: store.currentSessionId,
    items,
    savedAnchor,
    markSeen: store.markSeen,
    followMode: store.followMode,
    setFollowMode: store.setFollowMode,
    scrollToBottomTick: store.scrollToBottomTick,
    viewMode: store.viewMode,
    runningTailKey: agentTails.runningTailKey,
    connectingTailKey: agentTails.connectingTailKey,
  });

  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const onToggleComposerCollapsed = useCallback((): void => {
    setComposerCollapsed((collapsed) => !collapsed);
  }, []);

  return (
    <section className="feed-col" aria-label="Feed">
      <div
        ref={scroll.scrollRef}
        className={
          "feed-scroll" + (store.commentTarget !== null ? " dimmed" : "")
        }
        data-dimmed={store.commentTarget !== null}
      >
        <ToolboxAccordionProvider>
          <div className="feed-inner">
            {items.length === 0 ? (
              <FeedEmptyState
                viewMode={store.viewMode}
                loading={eventsLoading}
              />
            ) : (
              <>
                <FeedRows
                  items={items}
                  freshKeys={freshKeys}
                  savedAnchor={savedAnchor}
                  exitingDots={scroll.exitingDots}
                  participants={store.participants}
                  agg={agg}
                  consumedFilenames={consumedFilenames}
                />
                <FeedAgentTailItems tails={agentTails} />
              </>
            )}
          </div>
        </ToolboxAccordionProvider>
      </div>
      <FeedComposeDock
        dockRef={scroll.dockRef}
        composerCollapsed={composerCollapsed}
        unreadCount={scroll.unreadCount}
        isInUnreadRegion={scroll.isInUnreadRegion}
        activeAgentIds={agentTails.activeAgentIds}
        itemsLength={items.length}
        followMode={store.followMode}
        canGoPrev={scroll.canGoPrev}
        canGoNext={scroll.canGoNext}
        onUnreadClick={scroll.onUnreadClick}
        onPrev={scroll.onPrev}
        onNext={scroll.onNext}
        onToggleFollow={scroll.onToggleFollow}
        onScrollToBottom={scroll.onScrollToBottom}
        onToggleComposerCollapsed={onToggleComposerCollapsed}
      />
    </section>
  );
}

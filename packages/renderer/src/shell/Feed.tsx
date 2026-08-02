import {
  useCallback,
  useEffect,
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

  /* j/k reuse the step navigation that already powers FeedNavCluster's buttons.
     Only the key binding is new.

     The guard must cover EVERY editable surface, not just the composer: this app
     also has comment textareas, todo-item editors, session-rename editors and
     the cmdk palette. A composer-only guard lets j/k hijack typing in all of
     them. `closest()` on the active element covers nested editors too. */
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "j" && e.key !== "k") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable || active.closest("input, textarea, [contenteditable]"))
      ) {
        return;
      }
      e.preventDefault();
      if (e.key === "j") scroll.onNext();
      else scroll.onPrev();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [scroll.onNext, scroll.onPrev]);

  /* Deliberately imperative. FeedRows is not memoized, so a useState-driven
     version would re-render every card twice per hover movement on the
     densest surface in the app. This matches how useFeedScrollController
     already treats scroll and visibility as DOM-level concerns rather than
     component state. */
  useEffect(() => {
    const root = scroll.scrollRef.current;
    if (!root) return;
    function over(e: MouseEvent): void {
      const av = (e.target as HTMLElement | null)?.closest?.(
        "[data-participant-avatar]",
      );
      if (!av) return;
      const id = av.getAttribute("data-participant-avatar");
      root!.classList.add("is-focusing");
      for (const row of root!.querySelectorAll<HTMLElement>(
        "[data-participant-id]",
      )) {
        row.classList.toggle("is-hi", row.dataset.participantId === id);
      }
    }
    function out(e: MouseEvent): void {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-participant-avatar]")) {
        return;
      }
      root!.classList.remove("is-focusing");
      for (const row of root!.querySelectorAll<HTMLElement>(".is-hi")) {
        row.classList.remove("is-hi");
      }
    }
    root.addEventListener("mouseover", over);
    root.addEventListener("mouseout", out);
    return () => {
      root.removeEventListener("mouseover", over);
      root.removeEventListener("mouseout", out);
    };
  }, [scroll.scrollRef]);

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

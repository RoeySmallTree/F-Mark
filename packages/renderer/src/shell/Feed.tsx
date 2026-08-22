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

/* Same shape as FeedRows.tsx:10 — the fmark-rules/no-loose-string lint rule
   rejects bare string literals passed into DOM APIs, so the selectors and
   class names the participant-focus listener toggles live here instead. */
const NO_LOOSE_STRING_VALUES = {
  avatarAttr: "[data-participant-avatar]",
  avatarAttrName: "data-participant-avatar",
  participantAttr: "[data-participant-id]",
  focusing: "is-focusing",
  hi: "is-hi",
  hiSelector: ".is-hi",
} as const;

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
    /* Clearing has to be reachable from more than "the pointer left an
       avatar". Removing a node does not fire mouseout, and agentWorkingStrip
       renders a ParticipantAvatar that unmounts at every turn boundary — hover
       it, let the turn end, and the avatar vanishes under the cursor with no
       mouseout to answer. Every dimmed row then stays at opacity 0.28 with no
       visible cause. So: any hover that is NOT on an avatar clears, and
       leaving the scroll root clears. The contains() check keeps the common
       case (moving across ordinary feed content) a single class read on the
       densest surface in the app. */
    function clear(): void {
      if (!root!.classList.contains(NO_LOOSE_STRING_VALUES.focusing)) return;
      root!.classList.remove(NO_LOOSE_STRING_VALUES.focusing);
      for (const row of root!.querySelectorAll<HTMLElement>(
        NO_LOOSE_STRING_VALUES.hiSelector,
      )) {
        row.classList.remove(NO_LOOSE_STRING_VALUES.hi);
      }
    }
    function over(e: MouseEvent): void {
      const av = (e.target as HTMLElement | null)?.closest?.(
        NO_LOOSE_STRING_VALUES.avatarAttr,
      );
      if (!av) {
        clear();
        return;
      }
      const id = av.getAttribute(NO_LOOSE_STRING_VALUES.avatarAttrName);
      root!.classList.add(NO_LOOSE_STRING_VALUES.focusing);
      for (const row of root!.querySelectorAll<HTMLElement>(
        NO_LOOSE_STRING_VALUES.participantAttr,
      )) {
        row.classList.toggle(
          NO_LOOSE_STRING_VALUES.hi,
          row.dataset.participantId === id,
        );
      }
    }
    root.addEventListener("mouseover", over);
    root.addEventListener("mouseleave", clear);
    return () => {
      root.removeEventListener("mouseover", over);
      root.removeEventListener("mouseleave", clear);
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

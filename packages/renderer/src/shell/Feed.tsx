import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { ChevronDown } from "lucide-react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
import { EventCard } from "../cards/EventCard.js";
import { ArbitraryGroupCard } from "../cards/ArbitraryGroupCard.js";
import { projectFeed } from "../feed/projectFeed.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";
import { FeedNavCluster } from "./FeedNavCluster.js";
import { isNamedAnchor } from "@f-mark/shared";
import { ParticipantStrip } from "../components/ParticipantStrip.js";
import { pendingAccessCountForParticipant } from "../cards/AccessRequestCard.js";
import { LoadingAnimation } from "../components/LoadingAnimation.js";

/* Pixels of slack when deciding whether the user is "at the bottom".
   Wide enough to forgive scroll-momentum stops, narrow enough that
   follow mode flips off if they actively scroll a card or two up. */
const BOTTOM_SLACK_PX = 80;
/* How long after a programmatic scroll we ignore scroll events for
   the purpose of follow-mode auto-toggling. Smooth scroll animations
   span ~300–500ms — this window covers that without trapping the
   user in follow mode after they manually drag the scrollbar. */
const PROGRAMMATIC_SCROLL_MS = 500;
const NAMED_MODE_SHORTCUT = chordToLabel("$mod+N");

export function Feed(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const commentTarget = useStore((s) => s.commentTarget);
  const viewMode = useStore((s) => s.viewMode);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const presence = useStore((s) => s.presence);
  const lastSeenBySession = useStore((s) => s.lastSeenBySession);
  const markSeen = useStore((s) => s.markSeen);
  const followMode = useStore((s) => s.followMode);
  const setFollowMode = useStore((s) => s.setFollowMode);
  const scrollToBottomTick = useStore((s) => s.scrollToBottomTick);
  const agg = useMemo(() => aggregate(events), [events]);

  const runnableAgentIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentSessionId === null) return ids;
    for (const [id, participant] of Object.entries(participants)) {
      if (participant.kind !== "agent") continue;
      if (participant.active_session !== currentSessionId) continue;
      const state = presence[id]?.state;
      const pending = pendingAccessCountForParticipant(id, events) > 0;
      if (
        pending ||
        state === "online" ||
        state === "stale" ||
        state === "launching"
      ) {
        ids.add(id);
      }
    }
    return ids;
  }, [currentSessionId, participants, presence, events]);

  const hasTurnEnd = useMemo(
    () => events.some((e) => e.kind === "turn-end"),
    [events],
  );
  const agentTurnActive =
    runnableAgentIds.size > 0 &&
    (agg.currentTurnParticipantPrefix === "ag" || !hasTurnEnd);
  const activeAgentIds = useMemo(
    () => (agentTurnActive ? runnableAgentIds : new Set<string>()),
    [agentTurnActive, runnableAgentIds],
  );

  const showRunningTail =
    viewMode !== "document" &&
    activeAgentIds.size > 0 &&
    agentTurnActive;

  const slice =
    viewMode === "document"
      ? agg.feedDocument
      : viewMode === "conversation"
        ? agg.feedConversation
        : agg.feed;

  /* Build the consumed-filename set once at the Feed level — EventCard
     uses it as the early-out for composed blocks (rendered inside their
     anchor ProseCard, not at top level). Already pre-filtered out of
     the feed slices in aggregate.ts, but we still thread it through so
     the dispatcher can short-circuit any stray paths (e.g. command
     palette previews). */
  const consumedFilenames = useMemo(() => {
    const s = new Set<string>();
    for (const blocks of agg.consumedBlocksByAnchor.values()) {
      for (const b of blocks) s.add(b.filename);
    }
    return s;
  }, [agg.consumedBlocksByAnchor]);

  /* Projection applies to event streams that can contain mid-turn work. The
     document slice strips those events, but Everything and Conversation both
     need sub-agent grouping to keep child work attached to the parent turn. */
  const items = useMemo(
    () =>
      viewMode !== "document"
        ? projectFeed(slice)
        : slice.map((event) => ({ type: "event" as const, event })),
    [slice, viewMode],
  );

  /* Fresh-item tracking — animate only when the items array is a strict
     append of the previous one. Initial cascade: first render with no
     prior state, all items fresh. Pure appends (e.g. a new event arrives
     and lands at the end): only the appended items are fresh. Anything
     else (replacements, supersedes, reorderings) skips animation entirely
     so state-change events don't pop in like a glitch. */
  const seenKeysRef = useRef<string[] | null>(null);
  const freshKeys = useMemo(() => {
    const prev = seenKeysRef.current;
    const fresh = new Set<string>();
    const keyOf = (item: typeof items[number]): string =>
      item.type === "group"
        ? `grp-${item.items[0]!.filename}`
        : item.event.filename;
    if (prev === null) {
      for (const item of items) fresh.add(keyOf(item));
      return fresh;
    }
    if (items.length <= prev.length) return fresh;
    for (let i = 0; i < prev.length; i++) {
      if (keyOf(items[i]!) !== prev[i]) return fresh;
    }
    for (let i = prev.length; i < items.length; i++) {
      fresh.add(keyOf(items[i]!));
    }
    return fresh;
  }, [items]);

  useEffect(() => {
    seenKeysRef.current = items.map((item) =>
      item.type === "group"
        ? `grp-${item.items[0]!.filename}`
        : item.event.filename,
    );
  }, [items]);

  /* Read-position + follow-mode tracking.
     - `markSeen` is fed by an IntersectionObserver so any item that scrolls
       into view advances the per-session anchor in localStorage.
     - On a session switch, once events arrive, we scroll the saved anchor
       back into view (block: "center") so the user resumes where they were.
     - Items with filenames > the anchor power the "X unread" floater
       and the unread dot.
     - Follow mode auto-toggles based on scroll position (at-bottom ↔ on,
       scrolled-away ↔ off), and triggers smooth scroll on new items. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoredSessionRef = useRef<string | null>(null);
  const programmaticUntilRef = useRef<number>(0);
  const followModeRef = useRef<boolean>(followMode);
  followModeRef.current = followMode;
  const lastItemCountRef = useRef<number>(0);
  const lastScrollToBottomTickRef = useRef<number>(scrollToBottomTick);
  const [visibleFilenames, setVisibleFilenames] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const savedAnchor =
    currentSessionId !== null ? lastSeenBySession[currentSessionId] : undefined;

  /* itemKey is declared before the restore effect so the effect can list
     it in its dependency array without a temporal-dead-zone violation. */
  const itemKey = useCallback(
    (item: (typeof items)[number]): string =>
      item.type === "group"
        ? item.items[item.items.length - 1]!.filename
        : item.event.filename,
    [],
  );

  useEffect(() => {
    if (currentSessionId === null) return;
    if (items.length === 0) return;
    if (restoredSessionRef.current === currentSessionId) return;
    const root = scrollRef.current;
    /* If the root isn't mounted yet, leave restoredSessionRef untouched
       so the next render can try again. Setting it before the root check
       would silently skip restore on a remount. */
    if (root === null) return;
    restoredSessionRef.current = currentSessionId;
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;

    if (savedAnchor === undefined) {
      /* First-open rule: no saved anchor yet for this session. Seed the
         anchor to the latest loaded filename, jump to bottom, and enable
         follow mode. This is intentionally generic — fork sessions
         inherit the "everything looks read" behavior without any
         fork-specific code. markSeen is monotonic so any subsequent
         IntersectionObserver callback cannot regress. */
      const lastItem = items[items.length - 1];
      if (lastItem !== undefined) markSeen(itemKey(lastItem));
      root.scrollTo({ top: root.scrollHeight });
      setFollowMode(true);
      return;
    }

    const el = root.querySelector(
      `[data-event-filename="${cssEscape(savedAnchor)}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "center" });
    }
  }, [
    currentSessionId,
    items,
    savedAnchor,
    itemKey,
    markSeen,
    setFollowMode,
  ]);

  useEffect(() => {
    const root = scrollRef.current;
    if (root === null) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        let max: string | undefined;
        for (const entry of entries) {
          const fn = (entry.target as HTMLElement).dataset.eventFilename;
          if (fn === undefined) continue;
          if (entry.isIntersecting) {
            visible.add(fn);
            if (max === undefined || fn > max) max = fn;
          } else {
            visible.delete(fn);
          }
        }
        setVisibleFilenames(new Set(visible));
        if (max !== undefined) markSeen(max);
      },
      { root, threshold: 0.5 },
    );
    const nodes = root.querySelectorAll<HTMLElement>("[data-event-filename]");
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [items, markSeen]);

  const unreadCount = useMemo(() => {
    if (savedAnchor === undefined) return 0;
    let n = 0;
    for (const item of items) {
      if (itemKey(item) > savedAnchor) n++;
    }
    return n;
  }, [items, savedAnchor, itemKey]);

  /* "Within unread region" = any currently-visible item has a filename
     newer than the anchor. Used to flip the floater's click behavior. */
  const isInUnreadRegion = useMemo(() => {
    if (savedAnchor === undefined) return false;
    for (const fn of visibleFilenames) {
      if (fn > savedAnchor) return true;
    }
    return false;
  }, [visibleFilenames, savedAnchor]);

  /* Unread-dot exit animation. When markSeen advances the anchor past
     a previously-unread filename, the React tree would drop its dot
     immediately. To get a fade instead, we hold the dot for 240ms
     under an `.exiting` modifier then unmount it. */
  const [exitingDots, setExitingDots] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const prevAnchorRef = useRef<string | undefined>(savedAnchor);
  useEffect(() => {
    const prev = prevAnchorRef.current;
    prevAnchorRef.current = savedAnchor;
    if (savedAnchor === undefined) return;
    if (prev === undefined || savedAnchor === prev) return;
    const newlyRead: string[] = [];
    for (const item of items) {
      const fn = itemKey(item);
      if (fn > prev && fn <= savedAnchor) newlyRead.push(fn);
    }
    if (newlyRead.length === 0) return;
    setExitingDots((s) => {
      const next = new Set(s);
      for (const fn of newlyRead) next.add(fn);
      return next;
    });
    const t = setTimeout(() => {
      setExitingDots((s) => {
        const next = new Set(s);
        for (const fn of newlyRead) next.delete(fn);
        return next;
      });
    }, 240);
    return () => clearTimeout(t);
  }, [savedAnchor, items, itemKey]);

  /* Follow mode — when the items array grows, smooth-scroll the latest
     item's top into view. */
  useEffect(() => {
    const prevCount = lastItemCountRef.current;
    lastItemCountRef.current = items.length;
    if (items.length <= prevCount) return;
    if (!followModeRef.current) return;
    const root = scrollRef.current;
    if (root === null) return;
    const lastFn = itemKey(items[items.length - 1]!);
    const el = root.querySelector(`[data-event-filename="${cssEscape(lastFn)}"]`);
    if (el instanceof HTMLElement) {
      programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [items, itemKey]);

  /* Compose-triggered scroll-to-bottom (via the scrollToBottomTick).
     Also enables follow mode — submitting a message implies the user
     wants to see what comes next. */
  useEffect(() => {
    if (scrollToBottomTick === lastScrollToBottomTickRef.current) return;
    lastScrollToBottomTickRef.current = scrollToBottomTick;
    const root = scrollRef.current;
    if (root === null) return;
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    if (!followModeRef.current) setFollowMode(true);
  }, [scrollToBottomTick, setFollowMode]);

  /* User-driven scroll handling: flip follow mode based on whether the
     user is near the bottom. Programmatic scrolls within the past
     PROGRAMMATIC_SCROLL_MS are exempt so we don't trap users in follow
     after we just smooth-scrolled them somewhere. */
  useEffect(() => {
    const root = scrollRef.current;
    if (root === null) return;
    const handler = (): void => {
      if (Date.now() < programmaticUntilRef.current) return;
      const atBottom =
        root.scrollHeight - root.scrollTop - root.clientHeight <=
        BOTTOM_SLACK_PX;
      if (atBottom && !followModeRef.current) setFollowMode(true);
      else if (!atBottom && followModeRef.current) setFollowMode(false);
    };
    root.addEventListener("scroll", handler, { passive: true });
    return () => root.removeEventListener("scroll", handler);
  }, [setFollowMode]);

  const onUnreadClick = useCallback((): void => {
    if (savedAnchor === undefined) return;
    const root = scrollRef.current;
    if (root === null) return;
    /* Inside the unread region → jump to the last item; otherwise → jump
       to the first unread. Spec from the user. */
    if (isInUnreadRegion && items.length > 0) {
      const lastFn = itemKey(items[items.length - 1]!);
      const el = root.querySelector(
        `[data-event-filename="${cssEscape(lastFn)}"]`,
      );
      if (el instanceof HTMLElement) {
        programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    for (const item of items) {
      const fn = itemKey(item);
      if (fn > savedAnchor) {
        const el = root.querySelector(
          `[data-event-filename="${cssEscape(fn)}"]`,
        );
        if (el instanceof HTMLElement) {
          programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
    }
  }, [items, savedAnchor, itemKey, isInUnreadRegion]);

  /* Resolve the "anchor item" for prev/next navigation: the topmost
     feed-item whose top edge sits at or below the scroll-container's
     top edge (i.e. the first one not yet scrolled off-screen). */
  const findAnchorIndex = useCallback((): number => {
    const root = scrollRef.current;
    if (root === null) return -1;
    const rootTop = root.getBoundingClientRect().top;
    const nodes = root.querySelectorAll<HTMLElement>("[data-event-filename]");
    let bestIdx = -1;
    for (let i = 0; i < nodes.length; i++) {
      const top = nodes[i]!.getBoundingClientRect().top;
      if (top >= rootTop - 2) {
        bestIdx = i;
        break;
      }
    }
    return bestIdx;
  }, []);

  const scrollIndexIntoView = useCallback((idx: number): void => {
    const root = scrollRef.current;
    if (root === null) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-event-filename]");
    const el = nodes[idx];
    if (el === undefined) return;
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const onPrev = useCallback((): void => {
    const idx = findAnchorIndex();
    if (idx <= 0) return;
    scrollIndexIntoView(idx - 1);
  }, [findAnchorIndex, scrollIndexIntoView]);

  const onNext = useCallback((): void => {
    const idx = findAnchorIndex();
    const root = scrollRef.current;
    if (root === null) return;
    const total = root.querySelectorAll("[data-event-filename]").length;
    if (idx < 0 || idx >= total - 1) return;
    scrollIndexIntoView(idx + 1);
  }, [findAnchorIndex, scrollIndexIntoView]);

  const onToggleFollow = useCallback((): void => {
    if (followModeRef.current) {
      setFollowMode(false);
      return;
    }
    const root = scrollRef.current;
    if (root === null) {
      setFollowMode(true);
      return;
    }
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    setFollowMode(true);
  }, [setFollowMode]);

  const onScrollToBottom = useCallback((): void => {
    const root = scrollRef.current;
    if (root === null) return;
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    setFollowMode(true);
  }, [setFollowMode]);

  /* Boundary checks for the nav cluster's disable state. We treat the
     first item as "top" and the last as "bottom"; if either is currently
     in the viewport we disable the corresponding arrow. */
  const firstFn = items.length > 0 ? itemKey(items[0]!) : null;
  const lastFn =
    items.length > 0 ? itemKey(items[items.length - 1]!) : null;
  const canGoPrev =
    items.length > 1 && (firstFn === null || !visibleFilenames.has(firstFn));
  const canGoNext =
    items.length > 1 && (lastFn === null || !visibleFilenames.has(lastFn));

  return (
    <section className="feed-col" aria-label="Feed">
      <div
        ref={scrollRef}
        className={"feed-scroll" + (commentTarget !== null ? " dimmed" : "")}
        data-dimmed={commentTarget !== null}
      >
        <div className="feed-inner">
          {items.length === 0 ? (
            <EmptyState viewMode={viewMode} />
          ) : (
            items.map((item, idx) => {
              const key =
                item.type === "group"
                  ? `grp-${item.items[0]!.filename}`
                  : item.event.filename;
              const isFresh = freshKeys.has(key);
              const staggerIdx = Math.min(idx, 7);
              const motionStyle: React.CSSProperties = {
                ["--i" as string]: staggerIdx,
              };
              if (item.type === "group") {
                /* Track read-position past the whole group by tagging
                   the wrapper with the last item's filename — that way
                   when the group scrolls into view, the anchor advances
                   past every contained event. */
                const groupLastFn =
                  item.items[item.items.length - 1]!.filename;
                const isUnread =
                  savedAnchor !== undefined && groupLastFn > savedAnchor;
                const isExiting = exitingDots.has(groupLastFn);
                const showDot = isUnread || isExiting;
                return (
                  <div
                    key={key}
                    data-event-filename={groupLastFn}
                    className={
                      "feed-item" +
                      (isFresh ? " is-fresh" : "") +
                      (isUnread ? " is-unread" : "")
                    }
                    style={isFresh ? motionStyle : undefined}
                  >
                    {showDot && (
                      <span
                        className={
                          "feed-item-unread-dot" +
                          (isExiting && !isUnread ? " exiting" : "")
                        }
                        aria-hidden
                      />
                    )}
                    <ArbitraryGroupCard
                      group={item}
                      participants={participants}
                      allEvents={agg.events}
                    />
                  </div>
                );
              }
              const isOrphan = agg.orphanBlocks.has(item.event.filename);
              const isUnread =
                savedAnchor !== undefined && item.event.filename > savedAnchor;
              const isExiting = exitingDots.has(item.event.filename);
              const showDot = isUnread || isExiting;
              return (
                <div
                  key={key}
                  data-event-filename={item.event.filename}
                  data-orphan-embed={isOrphan ? "true" : undefined}
                  className={
                    "feed-item" +
                    (isOrphan ? " feed-item-orphan" : "") +
                    (isFresh ? " is-fresh" : "") +
                    (isUnread ? " is-unread" : "")
                  }
                  style={isFresh ? motionStyle : undefined}
                >
                  {showDot && (
                    <span
                      className={
                        "feed-item-unread-dot" +
                        (isExiting && !isUnread ? " exiting" : "")
                      }
                      aria-hidden
                    />
                  )}
                  {isOrphan && (
                    <div className="orphan-embed-badge" role="note">
                      orphaned embed — append_to points at a missing anchor
                    </div>
                  )}
                  <EventCard
                    event={item.event}
                    participants={participants}
                    comments={
                      agg.commentsByTarget.get(item.event.filename) ?? []
                    }
                    allEvents={agg.events}
                    consumedFilenames={consumedFilenames}
                    blocks={
                      isNamedAnchor(item.event)
                        ? agg.consumedBlocksByAnchor.get(item.event.filename) ?? []
                        : undefined
                    }
                    commentsByFilename={
                      isNamedAnchor(item.event)
                        ? agg.commentsByTarget
                        : undefined
                    }
                  />
                </div>
              );
            }).concat(
              showRunningTail
                ? [
                    <div
                      key="agent-ascii-running-tail"
                      className="feed-item agent-ascii-tail-item"
                    >
                      <AgentAsciiActivity
                        agentNames={[...activeAgentIds].map(
                          (id) => participants[id]?.name ?? id,
                        )}
                        blocked={[...activeAgentIds].some(
                          (id) =>
                            pendingAccessCountForParticipant(id, events) > 0,
                        )}
                      />
                    </div>,
                  ]
                : [],
            )
          )}
        </div>
      </div>
      {unreadCount > 0 && (
        <button
          type="button"
          className="unread-floater"
          onClick={onUnreadClick}
          aria-label={
            isInUnreadRegion
              ? `Jump to last message (${unreadCount} unread)`
              : `${unreadCount} unread message${unreadCount === 1 ? "" : "s"} — jump to first unread`
          }
        >
          {unreadCount} unread
          <ChevronDown size={14} aria-hidden />
        </button>
      )}
      <div className="feed-compose-toolbar">
        <ParticipantStrip activeAgentIds={activeAgentIds} />
        {items.length > 0 && (
          <FeedNavCluster
            followMode={followMode}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            onPrev={onPrev}
            onNext={onNext}
            onToggleFollow={onToggleFollow}
            onScrollToBottom={onScrollToBottom}
          />
        )}
      </div>
    </section>
  );
}

function AgentAsciiActivity({
  agentNames,
  blocked,
}: {
  agentNames: string[];
  blocked: boolean;
}): JSX.Element {
  const label =
    agentNames.length === 0
      ? "Agent"
      : agentNames.length === 1
        ? agentNames[0]!
        : `${agentNames.length} agents`;
  return (
    <section
      className={`agent-ascii-card${blocked ? " blocked" : ""}`}
      aria-label={blocked ? "Agent pending approval" : "Agent running"}
    >
      <pre aria-hidden="true">{blocked ? "[!]" : "<>"} f-mark</pre>
      <div>
        <b>{blocked ? "Pending approval" : "Working"}</b>
        <span>{label}</span>
      </div>
    </section>
  );
}

function EmptyState({
  viewMode,
}: {
  viewMode: "everything" | "document" | "conversation";
}): JSX.Element {
  if (viewMode === "document") {
    return (
      <p className="empty-state" data-view="document">
        No named contributions yet. Switch the compose to{" "}
        <strong>Named</strong> (<code>{NAMED_MODE_SHORTCUT}</code>) and write
        your first piece.
      </p>
    );
  }
  if (viewMode === "conversation") {
    return (
      <p className="empty-state" data-view="conversation">
        No messages yet. Send a quick prompt — the agent reads it on their next
        turn.
      </p>
    );
  }
  return (
    <FeedLoadingState />
  );
}

function FeedLoadingState(): JSX.Element {
  return (
    <div
      className="empty-state feed-empty-loading"
      data-view="everything"
    >
      <LoadingAnimation className="feed-empty-pixel-loading" />
    </div>
  );
}

/* Use the platform CSS.escape when available so weird filename
   characters can't break the attribute selector. */
function cssEscape(s: string): string {
  const esc = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS
    ?.escape;
  return typeof esc === "function" ? esc(s) : s.replace(/"/g, '\\"');
}

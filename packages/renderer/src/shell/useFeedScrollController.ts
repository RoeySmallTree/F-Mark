import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { FeedItem } from "../feed/projectFeed.js";
import type { ViewMode } from "../state/store.js";
import { cssEscape, feedItemReadKey } from "./feedItemKeys.js";

const NO_LOOSE_STRING_VALUES = {
  composeDockH: "--compose-dock-h",
  empty: "empty",
} as const;

/* Pixels of slack when deciding whether the user is "at the bottom".
   Wide enough to forgive scroll-momentum stops, narrow enough that
   follow mode flips off if they actively scroll a card or two up. */
const BOTTOM_SLACK_PX = 80;
/* How long after a programmatic scroll we ignore scroll events for
   the purpose of follow-mode auto-toggling. Smooth scroll animations
   span ~300-500ms; this window covers that without trapping the
   user in follow mode after they manually drag the scrollbar. */
const PROGRAMMATIC_SCROLL_MS = 500;

export interface FeedScrollController {
  scrollRef: RefObject<HTMLDivElement>;
  dockRef: RefObject<HTMLDivElement>;
  exitingDots: ReadonlySet<string>;
  unreadCount: number;
  isInUnreadRegion: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onUnreadClick(): void;
  onPrev(): void;
  onNext(): void;
  onToggleFollow(): void;
  onScrollToBottom(): void;
}

export function useFeedScrollController({
  currentSessionId,
  items,
  savedAnchor,
  markSeen,
  followMode,
  setFollowMode,
  scrollToBottomTick,
  viewMode,
  runningTailKey,
  connectingTailKey,
}: {
  currentSessionId: string | null;
  items: FeedItem[];
  savedAnchor: string | undefined;
  markSeen(filename: string): void;
  followMode: boolean;
  setFollowMode(followMode: boolean): void;
  scrollToBottomTick: number;
  viewMode: ViewMode;
  runningTailKey: string;
  connectingTailKey: string;
}): FeedScrollController {
  const refs = useFeedScrollRefs(followMode, scrollToBottomTick);
  const read = useFeedReadState({
    currentSessionId,
    items,
    savedAnchor,
    markSeen,
    setFollowMode,
    scrollRef: refs.scrollRef,
    dockRef: refs.dockRef,
    programmaticUntilRef: refs.programmaticUntilRef,
    restoredSessionRef: refs.restoredSessionRef,
  });
  const follow = useFeedFollowActions({
    currentSessionId,
    items,
    viewMode,
    runningTailKey,
    connectingTailKey,
    scrollToBottomTick,
    setFollowMode,
    scrollRef: refs.scrollRef,
    followModeRef: refs.followModeRef,
    programmaticUntilRef: refs.programmaticUntilRef,
    lastFollowSessionRef: refs.lastFollowSessionRef,
    lastFollowTargetRef: refs.lastFollowTargetRef,
    lastScrollToBottomTickRef: refs.lastScrollToBottomTickRef,
  });
  const navigation = useFeedStepNavigation({
    items,
    visibleFilenames: read.visibleFilenames,
    scrollRef: refs.scrollRef,
    programmaticUntilRef: refs.programmaticUntilRef,
  });

  return {
    scrollRef: refs.scrollRef,
    dockRef: refs.dockRef,
    exitingDots: read.exitingDots,
    unreadCount: read.unreadCount,
    isInUnreadRegion: read.isInUnreadRegion,
    canGoPrev: navigation.canGoPrev,
    canGoNext: navigation.canGoNext,
    onUnreadClick: read.onUnreadClick,
    onPrev: navigation.onPrev,
    onNext: navigation.onNext,
    onToggleFollow: follow.onToggleFollow,
    onScrollToBottom: follow.onScrollToBottom,
  };
}

interface FeedScrollRefs {
  scrollRef: RefObject<HTMLDivElement>;
  dockRef: RefObject<HTMLDivElement>;
  restoredSessionRef: MutableRefObject<string | null>;
  programmaticUntilRef: MutableRefObject<number>;
  followModeRef: MutableRefObject<boolean>;
  lastFollowSessionRef: MutableRefObject<string | null>;
  lastFollowTargetRef: MutableRefObject<string | null>;
  lastScrollToBottomTickRef: MutableRefObject<number>;
}

function useFeedScrollRefs(
  followMode: boolean,
  scrollToBottomTick: number,
): FeedScrollRefs {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const restoredSessionRef = useRef<string | null>(null);
  const programmaticUntilRef = useRef<number>(0);
  const followModeRef = useRef<boolean>(followMode);
  const lastFollowSessionRef = useRef<string | null>(null);
  const lastFollowTargetRef = useRef<string | null>(null);
  const lastScrollToBottomTickRef = useRef<number>(scrollToBottomTick);
  followModeRef.current = followMode;
  return {
    scrollRef,
    dockRef,
    restoredSessionRef,
    programmaticUntilRef,
    followModeRef,
    lastFollowSessionRef,
    lastFollowTargetRef,
    lastScrollToBottomTickRef,
  };
}

interface FeedReadState {
  visibleFilenames: ReadonlySet<string>;
  exitingDots: ReadonlySet<string>;
  unreadCount: number;
  isInUnreadRegion: boolean;
  onUnreadClick(): void;
}

function useFeedReadState({
  currentSessionId,
  items,
  savedAnchor,
  markSeen,
  setFollowMode,
  scrollRef,
  dockRef,
  programmaticUntilRef,
  restoredSessionRef,
}: {
  currentSessionId: string | null;
  items: FeedItem[];
  savedAnchor: string | undefined;
  markSeen(filename: string): void;
  setFollowMode(followMode: boolean): void;
  scrollRef: RefObject<HTMLDivElement>;
  dockRef: RefObject<HTMLDivElement>;
  programmaticUntilRef: MutableRefObject<number>;
  restoredSessionRef: MutableRefObject<string | null>;
}): FeedReadState {
  const [visibleFilenames, setVisibleFilenames] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [exitingDots, setExitingDots] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const prevAnchorRef = useRef<string | undefined>(savedAnchor);

  useRestoreReadPosition({
    currentSessionId,
    items,
    savedAnchor,
    scrollRef,
    programmaticUntilRef,
    restoredSessionRef,
    markSeen,
    setFollowMode,
  });
  useVisibleFilenameTracking({
    items,
    markSeen,
    scrollRef,
    dockRef,
    setVisibleFilenames,
  });
  useComposeDockHeight(dockRef);
  useExitingUnreadDots({
    items,
    savedAnchor,
    prevAnchorRef,
    setExitingDots,
  });

  const unreadCount = useMemo(
    () => countUnreadItems(items, savedAnchor),
    [items, savedAnchor],
  );
  const isInUnreadRegion = useMemo(
    () => visibleFilenamesHaveUnread(visibleFilenames, savedAnchor),
    [visibleFilenames, savedAnchor],
  );
  const onUnreadClick = useUnreadClick({
    items,
    savedAnchor,
    isInUnreadRegion,
    scrollRef,
    programmaticUntilRef,
  });

  return {
    visibleFilenames,
    exitingDots,
    unreadCount,
    isInUnreadRegion,
    onUnreadClick,
  };
}

interface FeedFollowActions {
  onToggleFollow(): void;
  onScrollToBottom(): void;
}

function useFeedFollowActions({
  currentSessionId,
  items,
  viewMode,
  runningTailKey,
  connectingTailKey,
  scrollToBottomTick,
  setFollowMode,
  scrollRef,
  followModeRef,
  programmaticUntilRef,
  lastFollowSessionRef,
  lastFollowTargetRef,
  lastScrollToBottomTickRef,
}: {
  currentSessionId: string | null;
  items: FeedItem[];
  viewMode: ViewMode;
  runningTailKey: string;
  connectingTailKey: string;
  scrollToBottomTick: number;
  setFollowMode(followMode: boolean): void;
  scrollRef: RefObject<HTMLDivElement>;
  followModeRef: MutableRefObject<boolean>;
  programmaticUntilRef: MutableRefObject<number>;
  lastFollowSessionRef: MutableRefObject<string | null>;
  lastFollowTargetRef: MutableRefObject<string | null>;
  lastScrollToBottomTickRef: MutableRefObject<number>;
}): FeedFollowActions {
  const followTargetKey = useMemo(
    () =>
      currentSessionId === null
        ? null
        : `${currentSessionId}:${viewMode}:${latestFeedItemKey(items)}:${runningTailKey}:${connectingTailKey}`,
    [currentSessionId, viewMode, items, runningTailKey, connectingTailKey],
  );
  useFollowLatestTail({
    currentSessionId,
    followTargetKey,
    scrollRef,
    followModeRef,
    programmaticUntilRef,
    lastFollowSessionRef,
    lastFollowTargetRef,
  });
  useComposeScrollToBottom({
    scrollToBottomTick,
    scrollRef,
    followModeRef,
    programmaticUntilRef,
    lastScrollToBottomTickRef,
    setFollowMode,
  });
  useFollowModeScrollTracking({
    scrollRef,
    followModeRef,
    programmaticUntilRef,
    setFollowMode,
  });
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
    markProgrammaticScroll(programmaticUntilRef);
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    setFollowMode(true);
  }, [followModeRef, programmaticUntilRef, scrollRef, setFollowMode]);
  const onScrollToBottom = useCallback((): void => {
    const root = scrollRef.current;
    if (root === null) return;
    markProgrammaticScroll(programmaticUntilRef);
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    setFollowMode(true);
  }, [programmaticUntilRef, scrollRef, setFollowMode]);

  return {
    onToggleFollow,
    onScrollToBottom,
  };
}

interface FeedStepNavigation {
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev(): void;
  onNext(): void;
}

function useFeedStepNavigation({
  items,
  visibleFilenames,
  scrollRef,
  programmaticUntilRef,
}: {
  items: FeedItem[];
  visibleFilenames: ReadonlySet<string>;
  scrollRef: RefObject<HTMLDivElement>;
  programmaticUntilRef: MutableRefObject<number>;
}): FeedStepNavigation {
  const scrollIndexIntoView = useScrollIndexIntoView(
    scrollRef,
    programmaticUntilRef,
  );
  const findAnchorIndex = useFindAnchorIndex(scrollRef);
  const onPrev = useCallback((): void => {
    const idx = findAnchorIndex();
    if (idx > 0) scrollIndexIntoView(idx - 1);
  }, [findAnchorIndex, scrollIndexIntoView]);
  const onNext = useCallback((): void => {
    const idx = findAnchorIndex();
    const total = eventNodeCount(scrollRef.current);
    if (idx >= 0 && idx < total - 1) scrollIndexIntoView(idx + 1);
  }, [findAnchorIndex, scrollIndexIntoView, scrollRef]);
  return {
    canGoPrev: canGoPrev(items, visibleFilenames),
    canGoNext: canGoNext(items, visibleFilenames),
    onPrev,
    onNext,
  };
}

function useRestoreReadPosition({
  currentSessionId,
  items,
  savedAnchor,
  scrollRef,
  programmaticUntilRef,
  restoredSessionRef,
  markSeen,
  setFollowMode,
}: {
  currentSessionId: string | null;
  items: FeedItem[];
  savedAnchor: string | undefined;
  scrollRef: RefObject<HTMLDivElement>;
  programmaticUntilRef: MutableRefObject<number>;
  restoredSessionRef: MutableRefObject<string | null>;
  markSeen(filename: string): void;
  setFollowMode(followMode: boolean): void;
}): void {
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
    markProgrammaticScroll(programmaticUntilRef);

    if (savedAnchor === undefined) {
      /* First-open rule: no saved anchor yet for this session. Seed the
         anchor to the latest loaded filename, jump to bottom, and enable
         follow mode. This is intentionally generic; fork sessions inherit
         the "everything looks read" behavior without fork-specific code. */
      markSeen(feedItemReadKey(items[items.length - 1]!));
      root.scrollTo({ top: root.scrollHeight });
      setFollowMode(true);
      return;
    }

    const el = queryEventNode(root, savedAnchor);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "center" });
    }
  }, [
    currentSessionId,
    items,
    savedAnchor,
    scrollRef,
    programmaticUntilRef,
    restoredSessionRef,
    markSeen,
    setFollowMode,
  ]);
}

function useVisibleFilenameTracking({
  items,
  markSeen,
  scrollRef,
  dockRef,
  setVisibleFilenames,
}: {
  items: FeedItem[];
  markSeen(filename: string): void;
  scrollRef: RefObject<HTMLDivElement>;
  dockRef: RefObject<HTMLDivElement>;
  setVisibleFilenames(next: ReadonlySet<string>): void;
}): void {
  useEffect(() => {
    const root = scrollRef.current;
    if (root === null) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        const max = recordVisibleFilenames(visible, entries);
        setVisibleFilenames(new Set(visible));
        if (max !== undefined) markSeen(max);
      },
      {
        root,
        threshold: 0.5,
        /* The composer dock floats over the bottom of the scroll viewport.
           Shrink the observer's bottom edge by the dock's height so items
           hidden behind it don't read as "visible". */
        rootMargin: `0px 0px -${Math.round(dockRef.current?.offsetHeight ?? 0)}px 0px`,
      },
    );
    eventNodes(root).forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [items, markSeen, scrollRef, dockRef, setVisibleFilenames]);
}

function recordVisibleFilenames(
  visible: Set<string>,
  entries: IntersectionObserverEntry[],
): string | undefined {
  let max: string | undefined;
  for (const entry of entries) {
    const filename = (entry.target as HTMLElement).dataset.feedReadKey;
    if (filename === undefined) continue;
    if (entry.isIntersecting) {
      visible.add(filename);
      if (max === undefined || filename > max) max = filename;
    } else {
      visible.delete(filename);
    }
  }
  return max;
}

function useComposeDockHeight(dockRef: RefObject<HTMLDivElement>): void {
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const host = dock?.parentElement ?? null;
    if (dock === null || host === null) return;
    const sync = (): void => {
      host.style.setProperty(NO_LOOSE_STRING_VALUES.composeDockH, `${dock.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(dock);
    return () => ro.disconnect();
  }, [dockRef]);
}

function useExitingUnreadDots({
  items,
  savedAnchor,
  prevAnchorRef,
  setExitingDots,
}: {
  items: FeedItem[];
  savedAnchor: string | undefined;
  prevAnchorRef: MutableRefObject<string | undefined>;
  setExitingDots(next: (s: ReadonlySet<string>) => ReadonlySet<string>): void;
}): void {
  useEffect(() => {
    const prev = prevAnchorRef.current;
    prevAnchorRef.current = savedAnchor;
    if (savedAnchor === undefined) return;
    if (prev === undefined || savedAnchor === prev) return;
    const newlyRead = newlyReadItemKeys(items, prev, savedAnchor);
    if (newlyRead.length === 0) return;
    setExitingDots((dots) => addAll(dots, newlyRead));
    const timer = setTimeout(() => {
      setExitingDots((dots) => removeAll(dots, newlyRead));
    }, 240);
    return () => clearTimeout(timer);
  }, [savedAnchor, items, prevAnchorRef, setExitingDots]);
}

function useFollowLatestTail({
  currentSessionId,
  followTargetKey,
  scrollRef,
  followModeRef,
  programmaticUntilRef,
  lastFollowSessionRef,
  lastFollowTargetRef,
}: {
  currentSessionId: string | null;
  followTargetKey: string | null;
  scrollRef: RefObject<HTMLDivElement>;
  followModeRef: MutableRefObject<boolean>;
  programmaticUntilRef: MutableRefObject<number>;
  lastFollowSessionRef: MutableRefObject<string | null>;
  lastFollowTargetRef: MutableRefObject<string | null>;
}): void {
  /* Follow mode: when the feed's actual tail changes, smooth-scroll to the
     real bottom. Projected groups can gain events without increasing
     `items.length`, and the active-agent tail is rendered outside `items`. */
  useEffect(() => {
    if (lastFollowSessionRef.current !== currentSessionId) {
      lastFollowSessionRef.current = currentSessionId;
      lastFollowTargetRef.current = followTargetKey;
      return;
    }
    const prevTarget = lastFollowTargetRef.current;
    lastFollowTargetRef.current = followTargetKey;
    if (followTargetKey === null || followTargetKey === prevTarget) return;
    if (!followModeRef.current) return;
    const root = scrollRef.current;
    if (root === null) return;
    markProgrammaticScroll(programmaticUntilRef);
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
  }, [
    currentSessionId,
    followTargetKey,
    scrollRef,
    followModeRef,
    programmaticUntilRef,
    lastFollowSessionRef,
    lastFollowTargetRef,
  ]);
}

function useComposeScrollToBottom({
  scrollToBottomTick,
  scrollRef,
  followModeRef,
  programmaticUntilRef,
  lastScrollToBottomTickRef,
  setFollowMode,
}: {
  scrollToBottomTick: number;
  scrollRef: RefObject<HTMLDivElement>;
  followModeRef: MutableRefObject<boolean>;
  programmaticUntilRef: MutableRefObject<number>;
  lastScrollToBottomTickRef: MutableRefObject<number>;
  setFollowMode(followMode: boolean): void;
}): void {
  useEffect(() => {
    if (scrollToBottomTick === lastScrollToBottomTickRef.current) return;
    lastScrollToBottomTickRef.current = scrollToBottomTick;
    const root = scrollRef.current;
    if (root === null) return;
    markProgrammaticScroll(programmaticUntilRef);
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    if (!followModeRef.current) setFollowMode(true);
  }, [
    scrollToBottomTick,
    scrollRef,
    followModeRef,
    programmaticUntilRef,
    lastScrollToBottomTickRef,
    setFollowMode,
  ]);
}

function useFollowModeScrollTracking({
  scrollRef,
  followModeRef,
  programmaticUntilRef,
  setFollowMode,
}: {
  scrollRef: RefObject<HTMLDivElement>;
  followModeRef: MutableRefObject<boolean>;
  programmaticUntilRef: MutableRefObject<number>;
  setFollowMode(followMode: boolean): void;
}): void {
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
  }, [scrollRef, followModeRef, programmaticUntilRef, setFollowMode]);
}

function useFindAnchorIndex(
  scrollRef: RefObject<HTMLDivElement>,
): () => number {
  return useCallback((): number => {
    const root = scrollRef.current;
    if (root === null) return -1;
    const rootTop = root.getBoundingClientRect().top;
    const nodes = eventNodes(root);
    return nodes.findIndex(
      (node) => node.getBoundingClientRect().top >= rootTop - 2,
    );
  }, [scrollRef]);
}

function useScrollIndexIntoView(
  scrollRef: RefObject<HTMLDivElement>,
  programmaticUntilRef: MutableRefObject<number>,
): (idx: number) => void {
  return useCallback(
    (idx: number): void => {
      const el = eventNodes(scrollRef.current)[idx];
      if (el === undefined) return;
      markProgrammaticScroll(programmaticUntilRef);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollRef, programmaticUntilRef],
  );
}

function useUnreadClick({
  items,
  savedAnchor,
  isInUnreadRegion,
  scrollRef,
  programmaticUntilRef,
}: {
  items: FeedItem[];
  savedAnchor: string | undefined;
  isInUnreadRegion: boolean;
  scrollRef: RefObject<HTMLDivElement>;
  programmaticUntilRef: MutableRefObject<number>;
}): () => void {
  return useCallback((): void => {
    if (savedAnchor === undefined) return;
    const root = scrollRef.current;
    if (root === null) return;
    const target = isInUnreadRegion
      ? latestFeedItemKey(items)
      : firstUnreadItemKey(items, savedAnchor);
    if (target !== NO_LOOSE_STRING_VALUES.empty && scrollFilenameIntoView(root, target)) {
      markProgrammaticScroll(programmaticUntilRef);
    }
  }, [items, savedAnchor, isInUnreadRegion, scrollRef, programmaticUntilRef]);
}

function countUnreadItems(
  items: FeedItem[],
  savedAnchor: string | undefined,
): number {
  if (savedAnchor === undefined) return 0;
  return items.filter((item) => feedItemReadKey(item) > savedAnchor).length;
}

function visibleFilenamesHaveUnread(
  visibleFilenames: ReadonlySet<string>,
  savedAnchor: string | undefined,
): boolean {
  if (savedAnchor === undefined) return false;
  for (const filename of visibleFilenames) {
    if (filename > savedAnchor) return true;
  }
  return false;
}

function newlyReadItemKeys(
  items: FeedItem[],
  previousAnchor: string,
  savedAnchor: string,
): string[] {
  return items
    .map(feedItemReadKey)
    .filter((filename) => filename > previousAnchor && filename <= savedAnchor);
}

function addAll(
  filenames: ReadonlySet<string>,
  added: string[],
): ReadonlySet<string> {
  return new Set([...filenames, ...added]);
}

function removeAll(
  filenames: ReadonlySet<string>,
  removed: string[],
): ReadonlySet<string> {
  const removedSet = new Set(removed);
  return new Set([...filenames].filter((filename) => !removedSet.has(filename)));
}

function firstUnreadItemKey(
  items: FeedItem[],
  savedAnchor: string,
): string | null {
  return (
    items.map(feedItemReadKey).find((filename) => filename > savedAnchor) ?? null
  );
}

function latestFeedItemKey(items: FeedItem[]): string {
  const latest = items[items.length - 1];
  return latest === undefined ? NO_LOOSE_STRING_VALUES.empty : feedItemReadKey(latest);
}

function canGoPrev(
  items: FeedItem[],
  visibleFilenames: ReadonlySet<string>,
): boolean {
  const first = items[0];
  return (
    items.length > 1 &&
    (first === undefined || !visibleFilenames.has(feedItemReadKey(first)))
  );
}

function canGoNext(
  items: FeedItem[],
  visibleFilenames: ReadonlySet<string>,
): boolean {
  const last = items[items.length - 1];
  return (
    items.length > 1 &&
    (last === undefined || !visibleFilenames.has(feedItemReadKey(last)))
  );
}

/* Read-tracking observes only OUTER feed rows (event rows, group rows, and
   consumed-block stubs) via data-feed-read-key — never the inline
   data-event-filename that folded-in blocks stamp, which would otherwise let
   viewing an anchor advance savedAnchor past unrelated rows. */
function eventNodes(root: HTMLDivElement | null): HTMLElement[] {
  return root === null
    ? []
    : [...root.querySelectorAll<HTMLElement>("[data-feed-read-key]")];
}

function eventNodeCount(root: HTMLDivElement | null): number {
  return eventNodes(root).length;
}

function queryEventNode(
  root: HTMLDivElement,
  filename: string,
): Element | null {
  return root.querySelector(`[data-feed-read-key="${cssEscape(filename)}"]`);
}

function scrollFilenameIntoView(
  root: HTMLDivElement,
  filename: string | null,
): boolean {
  if (filename === null) return false;
  const el = queryEventNode(root, filename);
  if (!(el instanceof HTMLElement)) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function markProgrammaticScroll(ref: MutableRefObject<number>): void {
  ref.current = Date.now() + PROGRAMMATIC_SCROLL_MS;
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import type { CommentGroup } from "../commentModel.js";
import {
  alignFeedAnchorToCard,
  cssEscape,
  scrollToTop,
} from "../commentScroll.js";
import { isInsideCommentUi, shouldKeepFocusForEscape } from "./focusGuards.js";
import { activeKeyForTarget, targetForGroup } from "./targetModel.js";
import type { RightCommentsSnapshot } from "./useRightCommentsSnapshot.js";

const NO_LOOSE_STRING_VALUES = {
  comments: "comments",
  commentFocusPulse: "comment-focus-pulse",
} as const;

interface UseCommentFocusControllerInput {
  commentTarget: RightCommentsSnapshot["commentTarget"];
  focusedCommentId: RightCommentsSnapshot["focusedCommentId"];
  groups: CommentGroup[];
  setCommentTarget: RightCommentsSnapshot["setCommentTarget"];
  setFocusedCommentId: RightCommentsSnapshot["setFocusedCommentId"];
  setRightTab: RightCommentsSnapshot["setRightTab"];
}

interface CommentFocusController {
  activeKey: string | null;
  closeFocus(): void;
  focusGroup(group: CommentGroup): void;
  panelRef: RefObject<HTMLDivElement>;
}

type RafRef = { current: number | null };

export function useCommentFocusController({
  commentTarget,
  focusedCommentId,
  groups,
  setCommentTarget,
  setFocusedCommentId,
  setRightTab,
}: UseCommentFocusControllerInput): CommentFocusController {
  const panelRef = useRef<HTMLDivElement>(null);
  const activeKey = useMemo(
    () => activeKeyForTarget(commentTarget),
    [commentTarget],
  );
  const scheduleFocusedGroupScroll = useScheduledGroupScroll(panelRef);

  useScrollActiveGroup(activeKey, groups, scheduleFocusedGroupScroll);
  useFocusedCommentPulse(
    activeKey,
    focusedCommentId,
    panelRef,
    setFocusedCommentId,
  );
  useCommentTargetDismiss(commentTarget, setCommentTarget);

  const closeFocus = useCallback((): void => {
    setCommentTarget(null);
  }, [setCommentTarget]);

  const focusGroup = useCallback(
    (group: CommentGroup): void => {
      setCommentTarget(targetForGroup(group));
      setRightTab(NO_LOOSE_STRING_VALUES.comments);
      scheduleFocusedGroupScroll(group);
    },
    [scheduleFocusedGroupScroll, setCommentTarget, setRightTab],
  );

  return {
    activeKey,
    closeFocus,
    focusGroup,
    panelRef,
  };
}

function useScheduledGroupScroll(
  panelRef: RefObject<HTMLDivElement>,
): (group: CommentGroup) => void {
  const focusedScrollRafRef = useRef<number | null>(null);

  const scrollFocusedGroup = useCallback(
    (group: CommentGroup): void => scrollGroupIntoView(panelRef, group),
    [panelRef],
  );
  const cancelFocusedScroll = useCallback((): void => {
    cancelScheduledRaf(focusedScrollRafRef);
  }, []);

  const scheduleFocusedGroupScroll = useCallback(
    (group: CommentGroup): void => {
      cancelFocusedScroll();
      focusedScrollRafRef.current = window.requestAnimationFrame(() => {
        focusedScrollRafRef.current = window.requestAnimationFrame(() => {
          focusedScrollRafRef.current = null;
          scrollFocusedGroup(group);
        });
      });
    },
    [cancelFocusedScroll, scrollFocusedGroup],
  );

  useEffect(() => cancelFocusedScroll, [cancelFocusedScroll]);

  return scheduleFocusedGroupScroll;
}

function useScrollActiveGroup(
  activeKey: string | null,
  groups: CommentGroup[],
  scheduleFocusedGroupScroll: (group: CommentGroup) => void,
): void {
  useEffect(() => {
    if (activeKey === null) return;
    const group = groups.find((item) => item.key === activeKey);
    if (group === undefined) return;
    scheduleFocusedGroupScroll(group);
  }, [activeKey, groups, scheduleFocusedGroupScroll]);
}

function useFocusedCommentPulse(
  activeKey: string | null,
  focusedCommentId: string | null,
  panelRef: RefObject<HTMLDivElement>,
  setFocusedCommentId: RightCommentsSnapshot["setFocusedCommentId"],
): void {
  useEffect(() => {
    if (focusedCommentId === null) return;
    if (activeKey === null) return;
    return pulseFocusedComment(panelRef, focusedCommentId, setFocusedCommentId);
  }, [activeKey, focusedCommentId, panelRef, setFocusedCommentId]);
}

function useCommentTargetDismiss(
  commentTarget: RightCommentsSnapshot["commentTarget"],
  setCommentTarget: RightCommentsSnapshot["setCommentTarget"],
): void {
  useEffect(() => {
    if (commentTarget === null) return;
    function onKey(e: globalThis.KeyboardEvent): void {
      if (shouldKeepFocusForEscape(e)) return;
      setCommentTarget(null);
    }
    function onMouseDown(e: globalThis.MouseEvent): void {
      if (isInsideCommentUi(e.target)) return;
      setCommentTarget(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [commentTarget, setCommentTarget]);
}

function scrollGroupIntoView(
  panelRef: RefObject<HTMLDivElement>,
  group: CommentGroup,
): void {
  const targets = findScrollTargets(panelRef, group);
  if (targets === null) return;
  const targetTop =
    targets.card.offsetTop -
    Math.max(0, (targets.panel.clientHeight - targets.card.offsetHeight) / 2);
  scrollToTop(targets.panel, Math.max(0, targetTop));
  window.requestAnimationFrame(() => alignFeedAnchorToCard(group, targets.card));
}

function findScrollTargets(
  panelRef: RefObject<HTMLDivElement>,
  group: CommentGroup,
): { card: HTMLElement; panel: HTMLElement } | null {
  const root = panelRef.current;
  if (root === null) return null;
  const panel = root.closest<HTMLElement>(".panel-scroll");
  const card = root.querySelector<HTMLElement>(
    `[data-thread-key="${cssEscape(group.key)}"]`,
  );
  if (panel === null || card === null) return null;
  return { card, panel };
}

function pulseFocusedComment(
  panelRef: RefObject<HTMLDivElement>,
  focusedCommentId: string,
  setFocusedCommentId: RightCommentsSnapshot["setFocusedCommentId"],
): () => void {
  let cancelled = false;
  let timeout: number | null = null;
  const raf = window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (cancelled) return;
      const node = panelRef.current?.querySelector<HTMLElement>(
        `[data-comment-event-id="${cssEscape(focusedCommentId)}"]`,
      );
      if (node === null || node === undefined) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      node.classList.add(NO_LOOSE_STRING_VALUES.commentFocusPulse);
      timeout = window.setTimeout(() => {
        node.classList.remove(NO_LOOSE_STRING_VALUES.commentFocusPulse);
      }, 900);
      setFocusedCommentId(null);
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf);
    if (timeout !== null) window.clearTimeout(timeout);
  };
}

function cancelScheduledRaf(rafRef: RafRef): void {
  if (rafRef.current === null) return;
  window.cancelAnimationFrame(rafRef.current);
  rafRef.current = null;
}

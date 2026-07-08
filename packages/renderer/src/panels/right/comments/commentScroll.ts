import type { CommentGroup } from "./commentModel.js";
import { lineKey } from "./commentModel.js";

const LINE_HEIGHT = 25;

export function cssEscape(value: string): string {
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.escape === "function"
  ) {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

export function scrollToTop(el: HTMLElement, top: number): void {
  if (typeof el.scrollTo === "function") {
    el.scrollTo({ top, behavior: "auto" });
  } else {
    el.scrollTop = top;
  }
}

export function alignFeedAnchorToCard(
  group: CommentGroup,
  card: HTMLElement,
): void {
  const feed = document.querySelector<HTMLElement>(".feed-scroll");
  const anchorTop = feedAnchorTop(group);
  if (feed === null || anchorTop === null) return;
  const cardTop = card.getBoundingClientRect().top;
  scrollByAmount(feed, anchorTop - cardTop);
}

function findFeedEventElement(filename: string): HTMLElement | null {
  const selector = `[data-event-filename="${cssEscape(filename)}"]`;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return candidates[0] ?? null;
}

function findTargetElement(filename: string): HTMLElement | null {
  const candidate = findFeedEventElement(filename);
  if (candidate === null) return null;
  const content = candidate.querySelector<HTMLElement>(".commentable-content");
  return content ?? candidate;
}

function feedAnchorTop(group: CommentGroup): number | null {
  const eventEl = findFeedEventElement(group.targetFile);
  if (eventEl === null) return null;
  if (group.lines !== undefined) {
    const marker = eventEl.querySelector<HTMLElement>(
      `[data-target-lines="${cssEscape(lineKey(group.lines))}"]`,
    );
    if (marker !== null) return marker.getBoundingClientRect().top;
  }
  const targetEl = findTargetElement(group.targetFile);
  if (targetEl === null) return eventEl.getBoundingClientRect().top;
  const fallbackOffset =
    group.lines === undefined ? 0 : (group.lines[0] - 1) * LINE_HEIGHT;
  return targetEl.getBoundingClientRect().top + fallbackOffset;
}

function scrollByAmount(el: HTMLElement, top: number): void {
  if (typeof el.scrollBy === "function") {
    el.scrollBy({ top, behavior: "smooth" });
  } else {
    el.scrollTop += top;
  }
}

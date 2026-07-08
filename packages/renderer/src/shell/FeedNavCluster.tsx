/* FeedNavCluster — a small, right-anchored pill of icon buttons that
   floats above the compose box: prev / next / follow-toggle / to-bottom.
   The cluster is a sibling of `.feed-scroll` inside `.feed-col`. */

import type { JSX } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  LocateFixed,
} from "lucide-react";

interface Props {
  followMode: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev(): void;
  onNext(): void;
  onToggleFollow(): void;
  onScrollToBottom(): void;
}

export function FeedNavCluster({
  followMode,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onToggleFollow,
  onScrollToBottom,
}: Props): JSX.Element {
  return (
    <div className="feed-nav-cluster" role="group" aria-label="Feed navigation">
      <button
        type="button"
        className="feed-nav-btn"
        onClick={onPrev}
        disabled={!canGoPrev}
        aria-label="Previous message"
        title="Previous message"
      >
        <ChevronUp size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="feed-nav-btn"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next message"
        title="Next message"
      >
        <ChevronDown size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={"feed-nav-btn feed-nav-follow" + (followMode ? " on" : "")}
        onClick={onToggleFollow}
        aria-label={followMode ? "Follow latest (on)" : "Follow latest (off)"}
        aria-pressed={followMode}
        title={
          followMode
            ? "Follow latest — on (click to stop)"
            : "Follow latest — off (click to resume)"
        }
      >
        <LocateFixed size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="feed-nav-btn"
        onClick={onScrollToBottom}
        aria-label="Scroll to bottom"
        title="Scroll to bottom"
      >
        <ChevronsDown size={14} aria-hidden />
      </button>
    </div>
  );
}

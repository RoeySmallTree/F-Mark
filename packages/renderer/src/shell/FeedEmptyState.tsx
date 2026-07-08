import type { JSX } from "react";
import { LoadingAnimation } from "../components/LoadingAnimation.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";
import type { ViewMode } from "../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  document: "document",
  conversation: "conversation",
} as const;

const NAMED_MODE_SHORTCUT = chordToLabel("$mod+N");

export function FeedEmptyState({
  viewMode,
  loading,
}: {
  viewMode: ViewMode;
  loading: boolean;
}): JSX.Element {
  if (loading) {
    return <FeedLoadingState viewMode={viewMode} />;
  }
  if (viewMode === NO_LOOSE_STRING_VALUES.document) {
    return (
      <div className="feed-empty-vignette" data-view="document">
        <div className="feed-empty-icon-outer" aria-hidden="true">
          <div className="feed-empty-icon-inner">
            <DocumentSvg />
          </div>
        </div>
        <p className="feed-empty-vignette-title">No named contributions yet</p>
        <p className="feed-empty-vignette-hint">
          Switch compose to <strong>Named</strong>{" "}
          (<code>{NAMED_MODE_SHORTCUT}</code>) and write your first piece.
        </p>
      </div>
    );
  }
  if (viewMode === NO_LOOSE_STRING_VALUES.conversation) {
    return (
      <div className="feed-empty-vignette" data-view="conversation">
        <div className="feed-empty-icon-outer" aria-hidden="true">
          <div className="feed-empty-icon-inner">
            <ConversationSvg />
          </div>
        </div>
        <p className="feed-empty-vignette-title">No messages yet</p>
        <p className="feed-empty-vignette-hint">
          Send a prompt — the agent reads it on their next turn.
        </p>
      </div>
    );
  }
  return <FeedLoadingState viewMode={viewMode} />;
}

function FeedLoadingState({ viewMode }: { viewMode: ViewMode }): JSX.Element {
  return (
    <div className="empty-state feed-empty-loading" data-view={viewMode}>
      <LoadingAnimation className="feed-empty-pixel-loading" />
    </div>
  );
}

/* ── Document / Named mode ─────────────────────────────────────────────── */
function DocumentSvg(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* fill layer */}
      <path
        d="M8 3H26L35 12V36C35 37.1 34.1 38 33 38H8C6.9 38 6 37.1 6 36V5C6 3.9 6.9 3 8 3Z"
        fill="currentColor"
        opacity="0.1"
      />
      {/* outline */}
      <path
        d="M8 3H26L35 12V36C35 37.1 34.1 38 33 38H8C6.9 38 6 37.1 6 36V5C6 3.9 6.9 3 8 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* folded corner */}
      <path d="M26 3V12H35" stroke="currentColor" strokeWidth="1.5" />
      {/* text lines */}
      <line
        x1="11"
        y1="19"
        x2="29"
        y2="19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.55"
      />
      <line
        x1="11"
        y1="24.5"
        x2="29"
        y2="24.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.55"
      />
      <line
        x1="11"
        y1="30"
        x2="21"
        y2="30"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.32"
      />
    </svg>
  );
}

/* ── Conversation / Msg mode ───────────────────────────────────────────── */
function ConversationSvg(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* fill layer */}
      <path
        d="M5 7C5 5.3 6.3 4 8 4H32C33.7 4 35 5.3 35 7V22C35 23.7 33.7 25 32 25H20.5L18 30L15.5 25H8C6.3 25 5 23.7 5 22V7Z"
        fill="currentColor"
        opacity="0.1"
      />
      {/* outline */}
      <path
        d="M5 7C5 5.3 6.3 4 8 4H32C33.7 4 35 5.3 35 7V22C35 23.7 33.7 25 32 25H20.5L18 30L15.5 25H8C6.3 25 5 23.7 5 22V7Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* ellipsis */}
      <circle cx="13" cy="14.5" r="1.8" fill="currentColor" />
      <circle cx="20" cy="14.5" r="1.8" fill="currentColor" />
      <circle cx="27" cy="14.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

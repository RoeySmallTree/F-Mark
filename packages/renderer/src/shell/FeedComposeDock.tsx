import type { JSX, RefObject } from "react";
import { ChevronDown, PanelBottomClose, PanelBottomOpen } from "lucide-react";
import { Compose } from "../compose/Compose.js";
import { ParticipantStrip } from "../components/ParticipantStrip.js";
import { FeedNavCluster } from "./FeedNavCluster.js";

export function FeedComposeDock({
  dockRef,
  composerCollapsed,
  unreadCount,
  isInUnreadRegion,
  activeAgentIds,
  itemsLength,
  followMode,
  canGoPrev,
  canGoNext,
  onUnreadClick,
  onPrev,
  onNext,
  onToggleFollow,
  onScrollToBottom,
  onToggleComposerCollapsed,
}: {
  dockRef: RefObject<HTMLDivElement>;
  composerCollapsed: boolean;
  unreadCount: number;
  isInUnreadRegion: boolean;
  activeAgentIds: Set<string>;
  itemsLength: number;
  followMode: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onUnreadClick(): void;
  onPrev(): void;
  onNext(): void;
  onToggleFollow(): void;
  onScrollToBottom(): void;
  onToggleComposerCollapsed(): void;
}): JSX.Element {
  return (
    <div
      className={
        "compose-dock" + (composerCollapsed ? " is-composer-collapsed" : "")
      }
      ref={dockRef}
    >
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
        <div className="feed-compose-toolbar-actions">
          {itemsLength > 0 && (
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
          <button
            type="button"
            className="composer-collapse-btn"
            onClick={onToggleComposerCollapsed}
            aria-label={composerCollapsed ? "Expand composer" : "Collapse composer"}
            aria-pressed={composerCollapsed}
            title={composerCollapsed ? "Expand composer" : "Collapse composer"}
          >
            {composerCollapsed ? (
              <PanelBottomOpen size={14} aria-hidden />
            ) : (
              <PanelBottomClose size={14} aria-hidden />
            )}
          </button>
        </div>
      </div>
      <div
        className="compose-shell"
        aria-hidden={composerCollapsed}
        {...(composerCollapsed ? { inert: "" } : {})}
      >
        <div className="compose">
          <Compose />
        </div>
      </div>
    </div>
  );
}

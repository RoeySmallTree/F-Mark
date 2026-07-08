import type { JSX } from "react";
import { Search } from "lucide-react";
import { ForkSessionPopover } from "../../components/ForkSessionPopover.js";
import { SessionContextMenu } from "./SessionContextMenu.js";
import { SessionRepoList } from "./SessionRepoList.js";
import type { SessionsController } from "./useSessionsController.js";

interface SessionsPanelViewProps {
  controller: SessionsController;
}

export function SessionsPanelView(
  props: SessionsPanelViewProps,
): JSX.Element {
  const { controller } = props;

  return (
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Sessions panel"
    >
      <div className="panel-head">
        <h3>SESSIONS</h3>
        <button
          type="button"
          className="new-btn"
          onClick={controller.openNewSessionModal}
          aria-label="Start a new session"
        >
          <span className="new-btn-core">
            <span className="new-btn-label">New</span>
            <span className="new-btn-icon" aria-hidden="true" />
          </span>
        </button>
      </div>
      <div className="panel-search">
        <Search size={12} aria-hidden="true" style={{ color: "var(--ink-4)" }} />
        <input
          placeholder="Search sessions…"
          value={controller.query}
          onChange={(e) => controller.setQuery(e.target.value)}
          aria-label="Search sessions"
        />
      </div>
      <div className="panel-list">
        <SessionRepoList controller={controller} />
        {controller.error !== null ? (
          <p className="panel-error" role="alert">
            {controller.error}
          </p>
        ) : null}
      </div>
      {controller.forkTarget !== null ? (
        <ForkSessionPopover
          anchorRect={controller.forkAnchorRect}
          target={controller.forkTarget}
          onClose={controller.closeFork}
          onForked={controller.handleForked}
        />
      ) : null}
      {controller.contextMenu !== null ? (
        <SessionContextMenu
          contextMenu={controller.contextMenu}
          onBeginRename={controller.beginRename}
          onClose={controller.closeContextMenu}
          onDelete={controller.deleteSession}
          onFocus={controller.selectSession}
          onOpenFork={controller.openForkFromMenu}
        />
      ) : null}
    </aside>
  );
}

import { useState, type JSX } from "react";
import { ChevronDown } from "lucide-react";
import { LoadingAnimation } from "../../components/LoadingAnimation.js";
import {
  GROUP_ORDER,
  groupSessionsByDate,
  isSessionActive,
  sessionKey,
  type RepoGroup,
} from "./model.js";
import { InlineNewSession } from "./InlineNewSession.js";
import { SessionRow } from "./SessionRow.js";
import type { SessionsController } from "./useSessionsController.js";

const INITIAL_SESSION_LIMIT = 10;

interface SessionRepoListProps {
  controller: SessionsController;
}

export function SessionRepoList(props: SessionRepoListProps): JSX.Element {
  const { controller } = props;

  if (controller.allSessionsCount === 0) {
    if (controller.loading) {
      return <LoadingAnimation className="panel-loading" />;
    }

    return (
      <p className="panel-empty">
        No sessions yet. Create one with the + button.
      </p>
    );
  }

  if (controller.repoGroups.length === 0) {
    return <p className="panel-empty">No matching sessions.</p>;
  }

  return (
    <>
      {controller.repoGroups.map((repo) => (
        <WorkspaceSessionGroup
          key={repo.key}
          repo={repo}
          controller={controller}
        />
      ))}
    </>
  );
}

function WorkspaceSessionGroup({
  repo,
  controller,
}: {
  repo: RepoGroup;
  controller: SessionsController;
}): JSX.Element {
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_SESSION_LIMIT);
  const visibleSessions = repo.sessions.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, repo.sessions.length - visibleSessions.length);
  const nextPageCount = Math.min(INITIAL_SESSION_LIMIT, hiddenCount);
  const dateGroups = groupSessionsByDate(visibleSessions, controller.now);
  let rowIndex = -1;

  return (
    <details
      className={[
        "repo-session-group",
        repo.path === controller.activePath ? "active-repo" : "",
      ]
        .join(" ")
        .trim()}
      open
    >
      <summary className="repo-session-summary">
        <ChevronDown
          size={13}
          strokeWidth={1.5}
          aria-hidden="true"
          className="repo-session-chevron"
        />
        <span className="repo-session-title">{repo.label}</span>
        {repo.path !== null ? (
          <InlineNewSession
            iconOnly
            path={repo.path}
            onCreated={(created) =>
              controller.handleInlineSessionCreated(repo.path!, created)
            }
            token={controller.token}
          />
        ) : null}
        {repo.path !== null ? (
          <span className="repo-session-path" title={repo.path}>
            {repo.path}
          </span>
        ) : null}
      </summary>
      <div className="repo-session-body">
        <div className="repo-session-owner-label">
          Sessions in this workspace
        </div>
        {GROUP_ORDER.map((key) => {
          const items = dateGroups.get(key) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={`${repo.key}:${key}`}>
              <div className="group-label">{key.toUpperCase()}</div>
              {items.map((session) => {
                rowIndex += 1;
                return (
                  <SessionRow
                    key={`${session.path ?? "__current__"}:${session.id}`}
                    active={isSessionActive(
                      session,
                      controller.currentSessionId,
                      controller.activePath,
                    )}
                    badge={controller.sessionBadge(session)}
                    draggingSessionId={controller.draggingSessionId}
                    dropTargetSessionId={controller.dropTargetSessionId}
                    now={controller.now}
                    renameValue={controller.renameValue}
                    renaming={controller.renamingSessionId === session.id}
                    repoKey={repo.key}
                    rowIndex={Math.min(rowIndex, 5)}
                    session={session}
                    switching={
                      controller.switchingSessionKey ===
                      sessionKey(session, controller.activePath)
                    }
                    onBeginRename={controller.beginRename}
                    onCancelRename={controller.cancelRename}
                    onMoveSessionInRepo={controller.moveSessionInRepo}
                    onOpenContextMenu={controller.openContextMenu}
                    onOpenFork={controller.openFork}
                    onRenameValueChange={controller.setRenameValue}
                    onSaveRename={controller.saveRename}
                    onSelect={controller.selectSession}
                    setDraggingSessionId={controller.setDraggingSessionId}
                    setDropTargetSessionId={
                      controller.setDropTargetSessionId
                    }
                  />
                );
              })}
            </div>
          );
        })}
        {hiddenCount > 0 ? (
          <button
            type="button"
            className="repo-session-more"
            onClick={() =>
              setVisibleLimit((current) => current + INITIAL_SESSION_LIMIT)
            }
            aria-label={`Show ${nextPageCount} more sessions in ${repo.label}`}
          >
            <span>Show {nextPageCount} more</span>
          </button>
        ) : null}
      </div>
    </details>
  );
}

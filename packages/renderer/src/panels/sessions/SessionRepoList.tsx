import type { JSX } from "react";
import { ChevronDown } from "lucide-react";
import { LoadingAnimation } from "../../components/LoadingAnimation.js";
import {
  GROUP_ORDER,
  groupSessionsByDate,
  isSessionActive,
  sessionKey,
} from "./model.js";
import { InlineNewSession } from "./InlineNewSession.js";
import { SessionRow } from "./SessionRow.js";
import type { SessionsController } from "./useSessionsController.js";

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
      <p
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          color: "var(--ink-3)",
          fontSize: 13,
          margin: "10px 14px",
        }}
      >
        No sessions yet. Press + New.
      </p>
    );
  }

  if (controller.repoGroups.length === 0) {
    return <p className="panel-empty">No matching sessions.</p>;
  }

  let staggerIdx = -1;
  return (
    <>
      {controller.repoGroups.map((repo) => {
        const dateGroups = groupSessionsByDate(repo.sessions, controller.now);
        return (
          <details
            key={repo.key}
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
                aria-hidden="true"
                className="repo-session-chevron"
              />
              <span className="repo-session-title">{repo.label}</span>
              <span className="repo-session-count">{repo.sessions.length}</span>
              {repo.path !== null ? (
                <span className="repo-session-path" title={repo.path}>
                  {repo.path}
                </span>
              ) : null}
            </summary>
            <div className="repo-session-body">
              {repo.path !== null ? (
                <InlineNewSession
                  path={repo.path}
                  onCreated={(created) =>
                    controller.handleInlineSessionCreated(repo.path!, created)
                  }
                  token={controller.token}
                />
              ) : null}
              {GROUP_ORDER.map((key) => {
                const items = dateGroups.get(key) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={`${repo.key}:${key}`}>
                    <div className="group-label">{key.toUpperCase()}</div>
                    {items.map((session) => {
                      staggerIdx += 1;
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
                          rowIndex={Math.min(staggerIdx, 5)}
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
            </div>
          </details>
        );
      })}
    </>
  );
}

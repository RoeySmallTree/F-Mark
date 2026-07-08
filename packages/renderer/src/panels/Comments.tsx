import { aggregate } from "../state/aggregate.js";
import {
  groupRecordsByPath,
  scopeLabel,
  shortPreview,
  useAllSessionEvents,
} from "./allSessions.js";
import { AllSessionsPanelShell } from "./AllSessionsPanelShell.js";
import {
  eventDomKey,
  participantName,
  prosePayloadOf,
} from "./prosePanelUtils.js";
import { RepoSessionGroup } from "./RepoSessionGroup.js";

const NO_LOOSE_STRING_VALUES = {
  prose: "prose",
  i: "--i",
} as const;

export function Comments(): JSX.Element {
  const { groups, loading, error } = useAllSessionEvents([NO_LOOSE_STRING_VALUES.prose]);
  const visibleGroups = groups
    .map((group) => {
      const agg = aggregate(group.events);
      const comments = [...agg.commentsByTarget.entries()].map(
        ([target, comments]) => ({ target, comments }),
      );
      return { group, comments };
    })
    .filter(({ comments }) => comments.length > 0);
  const pathGroups = groupRecordsByPath(visibleGroups);

  return (
    <AllSessionsPanelShell
      ariaLabel="Comments panel"
      emptyMessage="No comments across sessions yet."
      error={error}
      loading={loading}
      showEmpty={pathGroups.length === 0}
      title="COMMENTS"
    >
      {pathGroups.map((pathGroup) => (
        <RepoSessionGroup
          key={pathGroup.path}
          count={pathGroup.records.reduce(
            (n, record) =>
              n + record.comments.reduce((m, c) => m + c.comments.length, 0),
            0,
          )}
          path={pathGroup.path}
        >
          {pathGroup.records.map(({ group, comments }) => (
            <div key={group.session.id} className="repo-session-body">
              <div className="group-label">
                {scopeLabel(group.path, group.session).toUpperCase()}
              </div>
              {comments.map(({ target, comments }) => (
                <div key={target} style={{ marginBottom: 10 }}>
                  <div
                    className="group-label"
                    style={{ padding: "10px 0 6px" }}
                  >
                    ON "{target}"
                  </div>
                  {comments.map((ev, idx) => {
                    const payload = prosePayloadOf(ev);
                    const author = participantName(
                      group.participants,
                      ev.participant_id,
                    );
                    return (
                      <div
                        key={eventDomKey(
                          group.path,
                          group.session.id,
                          ev.filename,
                        )}
                        className="session-item staggered-row"
                        style={{
                          padding: "9px 10px",
                          [NO_LOOSE_STRING_VALUES.i as string]: Math.min(idx, 5),
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 6,
                            fontSize: 12,
                          }}
                        >
                          <b style={{ color: "var(--ink)" }}>{author}</b>
                        </div>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: "var(--ink-2)",
                            margin: "2px 0 4px",
                            fontFamily: "var(--serif)",
                            fontStyle: "italic",
                          }}
                        >
                          "{shortPreview(payload.content ?? "")}"
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </RepoSessionGroup>
      ))}
    </AllSessionsPanelShell>
  );
}

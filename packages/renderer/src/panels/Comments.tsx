import { ChevronDown } from "lucide-react";
import type { ProsePayload } from "@f-mark/shared";
import { aggregate } from "../state/aggregate.js";
import { LoadingAnimation } from "../components/LoadingAnimation.js";
import {
  basename,
  groupRecordsByPath,
  scopeLabel,
  shortPreview,
  useAllSessionEvents,
} from "./allSessions.js";

export function Comments(): JSX.Element {
  const { groups, loading, error } = useAllSessionEvents(["prose"]);
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
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Comments panel"
    >
      <div
        className="panel-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 0 }}
      >
        <h3>COMMENTS</h3>
        <div className="scope">
          across <b>all sessions</b>
        </div>
      </div>
      <div className="panel-list" style={{ padding: "0 12px 12px" }}>
        {error !== null ? <p className="panel-error">{error}</p> : null}
        {loading || pathGroups.length === 0 ? (
          <LoadingAnimation className="panel-loading" />
        ) : null}
        {pathGroups.map((pathGroup) => (
          <details key={pathGroup.path} className="repo-session-group" open>
            <summary className="repo-session-summary">
              <ChevronDown
                size={13}
                aria-hidden="true"
                className="repo-session-chevron"
              />
              <span className="repo-session-title">
                {basename(pathGroup.path)}
              </span>
              <span className="repo-session-count">
                {pathGroup.records.reduce(
                  (n, record) =>
                    n +
                    record.comments.reduce(
                      (m, c) => m + c.comments.length,
                      0,
                    ),
                  0,
                )}
              </span>
              <span className="repo-session-path" title={pathGroup.path}>
                {pathGroup.path}
              </span>
            </summary>
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
                      const payload = ev.payload as ProsePayload;
                      const author =
                        group.participants[ev.participant_id]?.name ??
                        ev.participant_id;
                      return (
                        <div
                          key={`${group.path}:${group.session.id}:${ev.filename}`}
                          className="session-item staggered-row"
                          style={{
                            padding: "9px 10px",
                            ["--i" as string]: Math.min(idx, 5),
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
          </details>
        ))}
      </div>
    </aside>
  );
}

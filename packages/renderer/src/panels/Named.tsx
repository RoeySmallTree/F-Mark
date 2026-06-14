import { ChevronDown, FileText } from "lucide-react";
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

export function Named(): JSX.Element {
  const { groups, loading, error } = useAllSessionEvents(["prose"]);
  const visibleGroups = groups
    .map((group) => ({ group, named: aggregate(group.events).named }))
    .filter(({ named }) => named.length > 0);
  const pathGroups = groupRecordsByPath(visibleGroups);

  function jumpTo(filename: string): void {
    const el = document.querySelector(`[data-event-filename="${filename}"]`);
    if (el !== null) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Named contributions panel"
    >
      <div
        className="panel-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 0 }}
      >
        <h3>NAMED</h3>
        <div className="scope">
          across <b>all sessions</b>
        </div>
      </div>
      <div className="panel-list" style={{ padding: "0 12px 12px" }}>
        {error !== null ? <p className="panel-error">{error}</p> : null}
        {loading || pathGroups.length === 0 ? (
          <LoadingAnimation className="panel-loading" />
        ) : (
          pathGroups.map((pathGroup) => (
            <details key={pathGroup.path} className="repo-session-group" open>
              <summary className="repo-session-summary">
                <ChevronDown
                  size={13}
                  aria-hidden="true"
                  className="repo-session-chevron"
                />
                <span className="repo-session-title">{basename(pathGroup.path)}</span>
                <span className="repo-session-count">
                  {pathGroup.records.reduce((n, record) => n + record.named.length, 0)}
                </span>
                <span className="repo-session-path" title={pathGroup.path}>
                  {pathGroup.path}
                </span>
              </summary>
              {pathGroup.records.map(({ group, named }) => (
                <div key={group.session.id} className="repo-session-body">
                  <div className="group-label">
                    {scopeLabel(group.path, group.session).toUpperCase()}
                  </div>
                  {named.map((ev, idx) => {
                    const payload = ev.payload as ProsePayload;
                    const author =
                      group.participants[ev.participant_id]?.name ??
                      ev.participant_id;
                    return (
                      <div
                        key={`${group.path}:${group.session.id}:${ev.filename}`}
                        role="button"
                        tabIndex={0}
                        className="session-item staggered-row"
                        style={{
                          padding: "10px 8px",
                          ["--i" as string]: Math.min(idx, 5),
                        }}
                        onClick={() => jumpTo(ev.filename)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            jumpTo(ev.filename);
                          }
                        }}
                      >
                        <div className="row1" style={{ gap: 9 }}>
                          <FileText
                            size={14}
                            style={{ color: "var(--agent)" }}
                            aria-hidden="true"
                          />
                          <span className="slug">
                            {payload.name ?? "(untitled)"}
                          </span>
                        </div>
                        {typeof payload.content === "string" &&
                        payload.content.length > 0 ? (
                          <div
                            className="summary"
                            style={{ paddingLeft: 23, fontStyle: "italic" }}
                          >
                            "{shortPreview(payload.content)}"
                          </div>
                        ) : null}
                        <div className="meta" style={{ paddingLeft: 23 }}>
                          <span>by {author}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </details>
          ))
        )}
      </div>
    </aside>
  );
}

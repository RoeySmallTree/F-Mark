import { FileText } from "lucide-react";
import { aggregate } from "../state/aggregate.js";
import {
  groupRecordsByPath,
  scopeLabel,
  shortPreview,
  useAllSessionEvents,
} from "./allSessions.js";
import { AllSessionsPanelShell } from "./AllSessionsPanelShell.js";
import {
  activateEventOnKey,
  eventDomKey,
  jumpToEvent,
  participantName,
  prosePayloadOf,
} from "./prosePanelUtils.js";
import { RepoSessionGroup } from "./RepoSessionGroup.js";

const NO_LOOSE_STRING_VALUES = {
  prose: "prose",
  i: "--i",
  untitled: "(untitled)",
} as const;

export function Named(): JSX.Element {
  const { groups, loading, error } = useAllSessionEvents([NO_LOOSE_STRING_VALUES.prose]);
  const visibleGroups = groups
    .map((group) => ({ group, named: aggregate(group.events).named }))
    .filter(({ named }) => named.length > 0);
  const pathGroups = groupRecordsByPath(visibleGroups);

  return (
    <AllSessionsPanelShell
      ariaLabel="Named contributions panel"
      emptyMessage="No named contributions across sessions yet."
      error={error}
      loading={loading}
      showEmpty={pathGroups.length === 0}
      title="NAMED"
    >
      {pathGroups.map((pathGroup) => (
        <RepoSessionGroup
          key={pathGroup.path}
          count={pathGroup.records.reduce(
            (n, record) => n + record.named.length,
            0,
          )}
          path={pathGroup.path}
        >
          {pathGroup.records.map(({ group, named }) => (
            <div key={group.session.id} className="repo-session-body">
              <div className="group-label">
                {scopeLabel(group.path, group.session).toUpperCase()}
              </div>
              {named.map((ev, idx) => {
                const payload = prosePayloadOf(ev);
                const author = participantName(
                  group.participants,
                  ev.participant_id,
                );
                return (
                  <div
                    key={eventDomKey(group.path, group.session.id, ev.filename)}
                    role="button"
                    tabIndex={0}
                    className="session-item staggered-row"
                    style={{
                      padding: "10px 8px",
                      [NO_LOOSE_STRING_VALUES.i as string]: Math.min(idx, 5),
                    }}
                    onClick={() => jumpToEvent(ev.filename)}
                    onKeyDown={(event) => activateEventOnKey(event, ev.filename)}
                  >
                    <div className="row1" style={{ gap: 9 }}>
                      <FileText
                        size={14}
                        style={{ color: "var(--agent)" }}
                        aria-hidden="true"
                      />
                      <span className="slug">
                        {payload.name ?? NO_LOOSE_STRING_VALUES.untitled}
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
        </RepoSessionGroup>
      ))}
    </AllSessionsPanelShell>
  );
}

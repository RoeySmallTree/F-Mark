import { useMemo, type JSX } from "react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
import { EventCard } from "../cards/EventCard.js";

export function Feed(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const commentTarget = useStore((s) => s.commentTarget);
  const agg = useMemo(() => aggregate(events), [events]);

  // Phase 13 will switch this between feed/document/conversation slices.
  const slice = agg.feed;

  return (
    <section className="feed-col" aria-label="Feed">
      <div
        className={"feed-scroll" + (commentTarget !== null ? " dimmed" : "")}
        data-dimmed={commentTarget !== null}
      >
        <div className="feed-inner">
          {slice.length === 0 ? (
            <p className="empty-state">
              No events yet — start with <code>/guide</code> or paste an invite
              to an agent.
            </p>
          ) : (
            slice.map((event) => (
              <div key={event.filename} data-event-filename={event.filename}>
                <EventCard
                  event={event}
                  participants={participants}
                  comments={agg.commentsByTarget.get(event.filename) ?? []}
                  allEvents={agg.events}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

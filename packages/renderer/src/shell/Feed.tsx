import { useMemo, type JSX } from "react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
import { EventCard } from "../cards/EventCard.js";

export function Feed(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const commentTarget = useStore((s) => s.commentTarget);
  const viewMode = useStore((s) => s.viewMode);
  const agg = useMemo(() => aggregate(events), [events]);

  const slice =
    viewMode === "document"
      ? agg.feedDocument
      : viewMode === "conversation"
        ? agg.feedConversation
        : agg.feed;

  return (
    <section className="feed-col" aria-label="Feed">
      <div
        className={"feed-scroll" + (commentTarget !== null ? " dimmed" : "")}
        data-dimmed={commentTarget !== null}
      >
        <div className="feed-inner">
          {slice.length === 0 ? (
            <EmptyState viewMode={viewMode} />
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

function EmptyState({
  viewMode,
}: {
  viewMode: "everything" | "document" | "conversation";
}): JSX.Element {
  if (viewMode === "document") {
    return (
      <p className="empty-state" data-view="document">
        No named contributions yet. Switch the compose to{" "}
        <strong>Named</strong> (<code>⌘N</code>) and write your first piece.
      </p>
    );
  }
  if (viewMode === "conversation") {
    return (
      <p className="empty-state" data-view="conversation">
        No messages yet. Send a quick prompt — the agent reads it on their next
        turn.
      </p>
    );
  }
  return (
    <p className="empty-state" data-view="everything">
      No events yet — start with <code>/guide</code> or paste an invite to an
      agent.
    </p>
  );
}

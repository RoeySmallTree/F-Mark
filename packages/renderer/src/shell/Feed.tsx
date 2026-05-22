import { useMemo } from "react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";

export function Feed(): JSX.Element {
  const events = useStore((s) => s.events);
  const agg = useMemo(() => aggregate(events), [events]);

  return (
    <section className="feed-col" aria-label="Feed">
      <div className="feed-scroll">
        <div className="feed-inner">
          {agg.feed.length === 0 ? (
            <p className="feed-placeholder">
              No events yet — start with <code>/guide</code> or a prose.
            </p>
          ) : (
            agg.feed.map((ev) => (
              <div
                key={ev.filename}
                data-event-filename={ev.filename}
                className="feed-placeholder"
              >
                {ev.kind} · {ev.participant_id}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

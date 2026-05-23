import { useMemo, type JSX } from "react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
import { EventCard } from "../cards/EventCard.js";
import { ArbitraryGroupCard } from "../cards/ArbitraryGroupCard.js";
import { projectFeed } from "../feed/projectFeed.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";
import { isNamedAnchor } from "@f-mark/shared";

const NAMED_MODE_SHORTCUT = chordToLabel("$mod+N");

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

  /* Build the consumed-filename set once at the Feed level — EventCard
     uses it as the early-out for composed blocks (rendered inside their
     anchor ProseCard, not at top level). Already pre-filtered out of
     the feed slices in aggregate.ts, but we still thread it through so
     the dispatcher can short-circuit any stray paths (e.g. command
     palette previews). */
  const consumedFilenames = useMemo(() => {
    const s = new Set<string>();
    for (const blocks of agg.consumedBlocksByAnchor.values()) {
      for (const b of blocks) s.add(b.filename);
    }
    return s;
  }, [agg.consumedBlocksByAnchor]);

  /* Projection only applies in `everything` mode. The document slice already
     strips out tool-use + arbitrary prose so projection would be a no-op,
     and the conversation slice strips tool-use too — projecting there would
     wrap arbitrary prose into pointless "0 tools" single-item groups. */
  const items = useMemo(
    () =>
      viewMode === "everything"
        ? projectFeed(slice)
        : slice.map((event) => ({ type: "event" as const, event })),
    [slice, viewMode],
  );

  return (
    <section className="feed-col" aria-label="Feed">
      <div
        className={"feed-scroll" + (commentTarget !== null ? " dimmed" : "")}
        data-dimmed={commentTarget !== null}
      >
        <div className="feed-inner">
          {items.length === 0 ? (
            <EmptyState viewMode={viewMode} />
          ) : (
            items.map((item) =>
              item.type === "group" ? (
                <ArbitraryGroupCard
                  key={`grp-${item.items[0]!.filename}`}
                  group={item}
                  participants={participants}
                  allEvents={agg.events}
                />
              ) : (
                <div
                  key={item.event.filename}
                  data-event-filename={item.event.filename}
                  data-orphan-embed={
                    agg.orphanBlocks.has(item.event.filename) ? "true" : undefined
                  }
                  className={
                    agg.orphanBlocks.has(item.event.filename)
                      ? "feed-item-orphan"
                      : undefined
                  }
                >
                  {agg.orphanBlocks.has(item.event.filename) && (
                    <div className="orphan-embed-badge" role="note">
                      orphaned embed — append_to points at a missing anchor
                    </div>
                  )}
                  <EventCard
                    event={item.event}
                    participants={participants}
                    comments={
                      agg.commentsByTarget.get(item.event.filename) ?? []
                    }
                    allEvents={agg.events}
                    consumedFilenames={consumedFilenames}
                    blocks={
                      isNamedAnchor(item.event)
                        ? agg.consumedBlocksByAnchor.get(item.event.filename) ?? []
                        : undefined
                    }
                    commentsByFilename={
                      isNamedAnchor(item.event)
                        ? agg.commentsByTarget
                        : undefined
                    }
                  />
                </div>
              ),
            )
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
        <strong>Named</strong> (<code>{NAMED_MODE_SHORTCUT}</code>) and write
        your first piece.
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
